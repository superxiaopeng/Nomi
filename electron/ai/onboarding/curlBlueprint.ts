/**
 * curlBlueprint — parse a single curl command into a ready-to-apply
 * vendor + auth + request mapping. The "AI-as-scribe, not-as-translator"
 * approach: rather than have the LLM interpret docs and assemble a
 * mapping piece-by-piece, this helper takes the curl as ground truth
 * and produces a complete draft in one shot.
 *
 * Input:  a curl command string from the docs (extractCurlExamples picks them up)
 * Output: { vendorBaseUrl, auth, request {method, path, headers, body},
 *           suggested_fields } ready to feed into set_vendor_info /
 *           set_mapping_request / set_fields.
 */
import type { AuthType } from "./types";

export type CurlBlueprint = {
  vendorBaseUrl: string;
  auth: { type: AuthType; headerName?: string };
  request: {
    method: string;
    path: string;
    headers: Record<string, string>;
    body?: unknown;
  };
  /** Body keys that look like user-supplied params, with a path hint. */
  suggested_fields: Array<{
    key: string;
    path: string;          // e.g. "input.aspect_ratio"
    value_in_curl: string; // verbatim value from the curl example
    guessed_type: "text" | "select" | "number" | "boolean";
  }>;
  warnings: string[];
};

/** Strip the BOM, line continuations (\\\n), comments. */
function normalizeCurl(curl: string): string {
  return curl
    .replace(/﻿/g, "")
    .replace(/\\\s*\n\s*/g, " ")
    .replace(/\s+#[^\n]*$/gm, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Extract -H header arguments. */
function extractHeaders(curl: string): Array<{ name: string; value: string }> {
  const headers: Array<{ name: string; value: string }> = [];
  // -H "Name: value" or --header "Name: value"
  const re = /(?:-H|--header)\s+(?:'([^']+)'|"((?:[^"\\]|\\.)*)")/g;
  let match;
  while ((match = re.exec(curl)) !== null) {
    const raw = match[1] || match[2] || "";
    const colonIdx = raw.indexOf(":");
    if (colonIdx === -1) continue;
    const name = raw.slice(0, colonIdx).trim();
    const value = raw.slice(colonIdx + 1).trim();
    if (name) headers.push({ name, value });
  }
  return headers;
}

/** Pull the URL out: support `curl <url>`, `curl -X POST <url>`, `--request POST '<url>'`. */
function extractUrl(curl: string): string {
  // Greedy: first http(s) URL in the command
  const m = curl.match(/(https?:\/\/[^\s'"\\]+)/);
  return m ? m[1] : "";
}

function extractMethod(curl: string): string {
  const m = curl.match(/(?:-X|--request)\s+(\w+)\b/i);
  return (m?.[1] || "POST").toUpperCase();
}

function extractBody(curl: string): string | undefined {
  // -d / --data / --data-raw / --data-binary / --json '...'
  const re = /(?:-d|--data(?:-raw|-binary)?|--json)\s+(?:'([\s\S]*?)'|"((?:[^"\\]|\\.)*)")/;
  const m = curl.match(re);
  return m?.[1] ?? m?.[2] ?? undefined;
}

/** Detect auth from header set. */
function detectAuth(headers: Array<{ name: string; value: string }>): {
  type: AuthType;
  headerName?: string;
} {
  for (const h of headers) {
    if (h.name.toLowerCase() === "authorization" && /^bearer\s+/i.test(h.value)) {
      return { type: "bearer" };
    }
    if (/^x-api-key$/i.test(h.name) || /^api-key$/i.test(h.name)) {
      return { type: "x-api-key", headerName: h.name };
    }
  }
  return { type: "bearer" };
}

/** Heuristics for what looks like a "user prompt"-style value. */
function looksLikeUserPrompt(value: string): boolean {
  if (typeof value !== "string") return false;
  const v = value.trim();
  if (v.length < 4) return false;
  if (/your/i.test(v)) return true;
  if (/example|sample|demo|test/i.test(v)) return true;
  if (v.split(/\s+/).length >= 3) return true; // multi-word value
  return false;
}

function guessType(value: unknown): "text" | "select" | "number" | "boolean" {
  if (typeof value === "number") return "number";
  if (typeof value === "boolean") return "boolean";
  if (typeof value === "string") {
    if (/^\d+(\.\d+)?$/.test(value)) return "number";
    if (/^(true|false)$/i.test(value)) return "boolean";
    // short enum-y values → likely select
    if (value.length <= 12 && !/\s/.test(value)) return "select";
    return "text";
  }
  return "text";
}

/** Walk JSON body, suggest fields to expose as user params. */
function collectFieldSuggestions(
  body: unknown,
  pathParts: string[] = [],
  out: CurlBlueprint["suggested_fields"] = [],
): CurlBlueprint["suggested_fields"] {
  if (!body || typeof body !== "object") return out;
  for (const [k, v] of Object.entries(body as Record<string, unknown>)) {
    const path = [...pathParts, k].join(".");
    // Skip keys that are clearly server-side wiring
    if (/^(model|api[-_]?key|token|secret|user_token)$/i.test(k)) continue;
    if (v && typeof v === "object" && !Array.isArray(v)) {
      collectFieldSuggestions(v, [...pathParts, k], out);
      continue;
    }
    const valStr = String(v);
    const isPromptish = looksLikeUserPrompt(valStr);
    const guessed = guessType(v);
    // Only suggest fields whose values look "user-visible" (prompt, options, etc).
    // Skip pure scalars that look like config (1, 0, true, false in a wiring slot).
    if (isPromptish || guessed === "select" || /^prompt|negative_prompt|description|aspect_ratio|size|duration|quality|style|seed$/i.test(k)) {
      out.push({
        key: k,
        path,
        value_in_curl: valStr,
        guessed_type: guessed,
      });
    }
  }
  return out;
}

/** Replace user-side values with template placeholders. */
function templatizeBody(body: unknown, fields: CurlBlueprint["suggested_fields"]): unknown {
  const fieldSet = new Set(fields.map((f) => f.path));
  const walk = (val: unknown, parents: string[] = []): unknown => {
    if (!val || typeof val !== "object") return val;
    if (Array.isArray(val)) return val.map((v, i) => walk(v, [...parents, String(i)]));
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(val as Record<string, unknown>)) {
      const here = [...parents, k];
      const fullPath = here.join(".");
      // model key → {{model.modelKey}}
      if (k === "model" && typeof v === "string") {
        out[k] = "{{model.modelKey}}";
        continue;
      }
      // top-level "prompt" → {{request.prompt}}
      if (k === "prompt" && typeof v === "string") {
        out[k] = "{{request.prompt}}";
        continue;
      }
      // suggested user fields → {{request.params.<key>}}
      if (fieldSet.has(fullPath)) {
        out[k] = `{{request.params.${k}}}`;
        continue;
      }
      out[k] = walk(v, here);
    }
    return out;
  };
  return walk(body);
}

/**
 * Ensure every onboarding field has a {{request.params.<key>}} slot in the
 * request body. The agent templatizes only the params it saw in the curl
 * example, so spec-derived params (resolution, duration, ...) that the user can
 * now select on the node would otherwise never be sent. We inject the missing
 * ones at the same nesting level where prompt / existing params live (e.g.
 * kie's `input` object), so they ride along in the same place as the rest.
 *
 * Pure + deterministic: deep-clones, never mutates the input. Generalizable —
 * it discovers the param container from existing placeholders rather than
 * hard-coding any provider's body shape.
 */
export function mergeMissingParamsIntoBody(body: unknown, fieldKeys: string[]): unknown {
  if (!body || typeof body !== "object") return body;
  const clone = JSON.parse(JSON.stringify(body)) as unknown;
  const PARAM_RE = /^\{\{\s*request\.params\.([A-Za-z0-9_]+)\s*\}\}$/;
  const PROMPT_RE = /^\{\{\s*request\.prompt\s*\}\}$/;
  const keySet = new Set(fieldKeys);

  const present = new Set<string>(); // keys already wired as {{request.params.*}}
  const literalHolders = new Map<string, Record<string, unknown>>(); // field key → obj holding a literal value
  let paramContainer: Record<string, unknown> | null = null; // where params live
  let promptContainer: Record<string, unknown> | null = null; // fallback nesting

  const walk = (val: unknown): void => {
    if (!val || typeof val !== "object") return;
    if (Array.isArray(val)) { val.forEach(walk); return; }
    const obj = val as Record<string, unknown>;
    for (const [k, v] of Object.entries(obj)) {
      if (typeof v === "string") {
        const pm = PARAM_RE.exec(v);
        if (pm) { present.add(pm[1]); paramContainer = obj; }
        else if (PROMPT_RE.test(v)) { promptContainer = obj; present.add(k); }
        else if (keySet.has(k)) { literalHolders.set(k, obj); }
      }
      walk(v);
    }
  };
  walk(clone);

  const container = paramContainer || promptContainer || (clone as Record<string, unknown>);
  for (const key of fieldKeys) {
    if (present.has(key)) continue; // already a placeholder
    const placeholder = `{{request.params.${key}}}`;
    const literalHolder = literalHolders.get(key);
    if (literalHolder) {
      literalHolder[key] = placeholder; // templatize an existing literal in place
    } else {
      container[key] = placeholder; // inject a brand-new slot at the param level
    }
  }
  return clone;
}

/** Templatize Authorization-like headers. */
function templatizeHeaders(
  headers: Array<{ name: string; value: string }>,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const h of headers) {
    if (h.name.toLowerCase() === "authorization" && /^bearer\s+/i.test(h.value)) {
      out[h.name] = "Bearer {{user_api_key}}";
    } else if (/^x-api-key$/i.test(h.name) || /^api-key$/i.test(h.name)) {
      out[h.name] = "{{user_api_key}}";
    } else {
      out[h.name] = h.value;
    }
  }
  return out;
}

/** Parse a URL into baseUrl + path. */
function splitBaseAndPath(url: string): { baseUrl: string; path: string } {
  try {
    const u = new URL(url);
    return { baseUrl: `${u.protocol}//${u.host}`, path: u.pathname + u.search };
  } catch {
    return { baseUrl: url, path: "/" };
  }
}

export function parseCurlBlueprint(curl: string): CurlBlueprint {
  const warnings: string[] = [];
  const norm = normalizeCurl(curl);
  if (!/^curl\b/i.test(norm)) {
    warnings.push("input doesn't look like a curl command");
  }
  const url = extractUrl(norm);
  if (!url) {
    warnings.push("no URL found in curl");
  }
  const method = extractMethod(norm);
  const rawHeaders = extractHeaders(norm);
  const auth = detectAuth(rawHeaders);
  if (auth.type === "bearer" && !rawHeaders.some((h) => h.name.toLowerCase() === "authorization")) {
    warnings.push("no Authorization header found in curl — guessing bearer");
  }
  const rawBody = extractBody(norm);
  let parsedBody: unknown = undefined;
  if (rawBody) {
    try {
      parsedBody = JSON.parse(rawBody);
    } catch {
      parsedBody = rawBody;
      warnings.push("body was not valid JSON — keeping as raw string");
    }
  }
  const { baseUrl, path } = splitBaseAndPath(url);
  const suggested = collectFieldSuggestions(parsedBody);
  const templatedBody = parsedBody !== undefined ? templatizeBody(parsedBody, suggested) : undefined;
  const templatedHeaders = templatizeHeaders(rawHeaders);

  return {
    vendorBaseUrl: baseUrl,
    auth,
    request: {
      method,
      path,
      headers: templatedHeaders,
      ...(templatedBody !== undefined ? { body: templatedBody } : {}),
    },
    suggested_fields: suggested,
    warnings,
  };
}

import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { createAnthropic } from "@ai-sdk/anthropic";
import type { LanguageModelV1 } from "ai";

export type AiSdkProviderKind = "openai-compatible" | "anthropic";

export interface BuildAiSdkModelInput {
  kind: AiSdkProviderKind;
  baseURL: string;
  apiKey: string;
  modelId: string;
}

/**
 * Build a custom fetch that injects provider-specific tweaks into request bodies.
 *
 * Currently handles:
 *  - Moonshot Kimi K2.x: must include `enable_thinking: false` to allow
 *    tool calling without reasoning_content (AI SDK doesn't ship reasoning_content).
 */
function buildPatchedFetch(modelId: string): typeof fetch {
  const isKimiK2 = /^kimi-k2/i.test(modelId);
  const isMoonshot = /^(moonshot-|kimi-)/i.test(modelId);
  const debug = process.env.LAB_DEBUG_REQUESTS === "1";

  return (async (url: any, init?: any) => {
    if (init?.body && typeof init.body === "string") {
      try {
        const body = JSON.parse(init.body);
        // Kimi K2 thinking workaround
        if (isKimiK2) body.enable_thinking = false;
        if (debug && isMoonshot) {
          const fs = await import("node:fs");
          fs.writeFileSync(`/tmp/lab-request-${Date.now()}.json`, JSON.stringify(body, null, 2));
        }
        init = { ...init, body: JSON.stringify(body) };
      } catch {
        /* not JSON, leave as-is */
      }
    }
    return fetch(url as any, init);
  }) as typeof fetch;
}

/**
 * Factory that returns a Vercel AI SDK `LanguageModelV1` for either an
 * OpenAI-compatible endpoint (e.g. ChatFire) or the Anthropic Messages API.
 *
 * Keeping the construction in one place lets the rest of the runtime stay
 * agnostic to which provider is in use; all branching happens here.
 */
export function buildAiSdkModel(input: BuildAiSdkModelInput): LanguageModelV1 {
  const apiKey = (input.apiKey || "").trim();
  if (!apiKey) {
    throw new Error("buildAiSdkModel: apiKey is required");
  }
  const modelId = (input.modelId || "").trim();
  if (!modelId) {
    throw new Error("buildAiSdkModel: modelId is required");
  }
  const baseURL = (input.baseURL || "").trim().replace(/\/+$/, "");

  if (input.kind === "anthropic") {
    const provider = createAnthropic({
      apiKey,
      ...(baseURL ? { baseURL } : {}),
    });
    return provider.languageModel(modelId);
  }

  if (!baseURL) {
    throw new Error("buildAiSdkModel: baseURL is required for openai-compatible providers");
  }
  const provider = createOpenAICompatible({
    name: "nomi",
    baseURL,
    apiKey,
    fetch: buildPatchedFetch(modelId),
  });
  return provider.chatModel(modelId);
}

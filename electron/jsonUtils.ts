// 主进程通用纯工具 —— 从 runtime.ts 拆出的第一层地基（见
// docs/plan/2026-06-04-runtime-split-execution.md）。全部为无副作用纯函数，
// 便于单独测试与被 tasks/catalog/assets 等后续拆出的模块复用。

export type JsonRecord = Record<string, unknown>;

export function nowIso(): string {
  return new Date().toISOString();
}

export function trim(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/** 返回第一个 trim 后非空的字符串；都为空则 ""。 */
export function firstString(...values: unknown[]): string {
  for (const value of values) {
    const text = trim(value);
    if (text) return text;
  }
  return "";
}

export function isJsonRecord(value: unknown): value is JsonRecord {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

/** 沿 pathParts 逐层取值；任一层非对象即返回 undefined。 */
export function readNestedRecord(input: unknown, pathParts: string[]): unknown {
  let current = input;
  for (const part of pathParts) {
    if (!current || typeof current !== "object") return undefined;
    current = (current as JsonRecord)[part];
  }
  return current;
}

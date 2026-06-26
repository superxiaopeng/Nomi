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

/**
 * 找出字符串里第一个无法安全放进 HTTP 头/凭证的字符，返回 null 表示安全。
 * 治本于一个真坑（kie createTask 报「Cannot convert argument to a ByteString
 * because the character at index 7 has a value of 34915」）：API 密钥里混进中文/
 * 全角字符 → 拼进 `Authorization: Bearer …` 后，fetch 同步抛 ByteString 错，
 * 被 vendorHttp 误判成「网络超时」，让用户去查网络（永远修不好）。
 * 判据对齐 HTTP 头的硬约束：码点 > 0xFF（fetch ByteString 拒收）、或控制字符
 * （< 0x20 除 \t、或 0x7F，含 \r\n = 头注入风险）。两处共用：密钥存入前校验
 * （applyApiKeyUpsert）+ 发送前请求头守卫（requestJson）。
 */
export function findNonHeaderSafeChar(value: string): { index: number; code: number; char: string } | null {
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    if (code > 0xff || (code < 0x20 && code !== 0x09) || code === 0x7f) {
      return { index: i, code, char: value[i] };
    }
  }
  return null;
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

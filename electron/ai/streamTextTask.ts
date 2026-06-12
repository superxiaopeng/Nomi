// 文本任务的流式引擎（方案 A：路径 B 收口到 AI SDK）。
//
// 取代原 runtime.ts 直 POST /v1/chat/completions（一次性收口）。一个核心两种消费：
// ① 不传 onDelta → 跑完返回最终文本（runTask 文本分支用，对外契约不变）；
// ② 传 onDelta → 逐 token 回调（流式 IPC 用，渲染层增量写节点文档）。
//
// 复用 buildLanguageModelForVendor（vendor→模型单一真相）+ AI SDK streamText.textStream。
import { streamText } from "ai";
import { buildLanguageModelForVendor } from "./vendorLanguageModel";
import { sanitizeForBroadCompat } from "./promptSanitize";
import type { Model, Vendor } from "../catalog/types";

export type StreamTextTaskInput = {
  vendor: Vendor;
  model: Model;
  apiKey: string;
  prompt: string;
  /** image_to_prompt：把参考图作为多模态输入一并喂给模型。 */
  imageUrl?: string;
  temperature?: number;
  maxTokens?: number;
};

export type StreamTextTaskOptions = {
  onDelta?: (delta: string) => void;
  abortSignal?: AbortSignal;
};

/** http(s) URL 走 URL 引用（不内联）；data:/base64 等原样作字符串传给 SDK。 */
function toImagePart(imageUrl: string): { type: "image"; image: URL | string } {
  if (/^https?:\/\//i.test(imageUrl)) {
    try {
      return { type: "image", image: new URL(imageUrl) };
    } catch {
      /* 退回字符串 */
    }
  }
  return { type: "image", image: imageUrl };
}

/**
 * 流式跑一个文本任务。返回 { text, raw }——raw 合成成 OpenAI choices 形状，
 * 让渲染层既有的 extractTextFromChatRaw 零改动继续可用。
 */
export async function streamTextTask(
  input: StreamTextTaskInput,
  opts: StreamTextTaskOptions = {},
): Promise<{ text: string; raw: unknown }> {
  const model = buildLanguageModelForVendor(input.vendor, input.model, input.apiKey);
  // 收口 sanitize（P0-6）：与原文本分支同语义，prompt 统一 ASCII 可移植化。
  const promptText = sanitizeForBroadCompat(input.prompt);
  const content = input.imageUrl
    ? [{ type: "text" as const, text: promptText }, toImagePart(input.imageUrl)]
    : promptText;

  const result = streamText({
    model,
    messages: [{ role: "user", content }],
    temperature: typeof input.temperature === "number" ? input.temperature : 0.7,
    ...(typeof input.maxTokens === "number" && input.maxTokens > 0 ? { maxTokens: input.maxTokens } : {}),
    ...(opts.abortSignal ? { abortSignal: opts.abortSignal } : {}),
  });

  let text = "";
  for await (const delta of result.textStream) {
    text += delta;
    opts.onDelta?.(delta);
  }
  return { text, raw: { choices: [{ message: { role: "assistant", content: text } }] } };
}

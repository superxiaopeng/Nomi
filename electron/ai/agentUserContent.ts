// 把「文字 prompt + 待发附件」拼成 Vercel AI SDK 的 user message content。
// 纯函数（字节读取由 resolveImage 回调注入），便于单测。S2：图片走原生多模态；
// 非图片文件本片先计数提示（S3 加 PDF file part、S4 加文档抽文本）。

export type AgentUserAttachment = {
  url: string
  contentType: string
  fileName: string
  kind: 'image' | 'file'
}

export type ResolvedImage = { data: Uint8Array; mimeType: string }

type TextPart = { type: 'text'; text: string }
type ImagePart = { type: 'image'; image: Uint8Array; mimeType?: string }
export type AgentUserContent = string | Array<TextPart | ImagePart>

// 已知支持图片输入（vision）的模型族。meta.supportsImageInput 显式声明优先。
const VISION_MODEL_RE =
  /gpt-4o|gpt-4\.1|gpt-4-vision|chatgpt-4o|o1|o3|o4-mini|claude-3|claude-opus-4|claude-sonnet-4|claude-haiku-4|gemini|llava|qwen.*-?vl|pixtral|internvl|minicpm-v|grok.*vision|vision/i

export function modelSupportsImageInput(
  modelKey: string,
  modelAlias: string | null | undefined,
  meta: unknown,
): boolean {
  if (meta && typeof meta === 'object') {
    const declared = (meta as Record<string, unknown>).supportsImageInput
    if (typeof declared === 'boolean') return declared
  }
  return VISION_MODEL_RE.test(`${modelKey || ''} ${modelAlias || ''}`.toLowerCase())
}

export function buildAgentUserContent(params: {
  prompt: string
  attachments?: AgentUserAttachment[]
  supportsImageInput: boolean
  resolveImage: (url: string) => ResolvedImage | null
}): AgentUserContent {
  const { prompt, attachments = [], supportsImageInput, resolveImage } = params
  if (!attachments.length) return prompt

  const imageParts: ImagePart[] = []
  let droppedImages = 0
  let droppedFiles = 0

  for (const att of attachments) {
    if (att.kind === 'image') {
      if (!supportsImageInput) { droppedImages += 1; continue }
      const resolved = resolveImage(att.url)
      if (!resolved) { droppedImages += 1; continue }
      imageParts.push({ type: 'image', image: resolved.data, mimeType: resolved.mimeType || att.contentType })
    } else {
      droppedFiles += 1
    }
  }

  const notes: string[] = []
  if (droppedImages > 0) {
    notes.push(`（注：${droppedImages} 张图片未发送——当前模型不支持图片输入或读取失败。可在助手里换一个支持图片的模型。）`)
  }
  if (droppedFiles > 0) {
    notes.push(`（注：附带了 ${droppedFiles} 个文件，当前版本尚未读取其内容。）`)
  }

  const text = [prompt, ...notes].filter(Boolean).join('\n\n')
  if (!imageParts.length) return text
  return [{ type: 'text', text }, ...imageParts]
}

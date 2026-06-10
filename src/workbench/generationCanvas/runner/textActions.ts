import type { GenerationCanvasNode, GenerationNodeResult, TiptapDocJson } from '../model/generationCanvasTypes'
import { useGenerationCanvasStore } from '../store/generationCanvasStore'
import { markdownToTiptapContent } from '../../creation/markdownToTiptap'
import { runCatalogGenerationTask, type CatalogTaskActionOptions } from './catalogTaskActions'

export type GenerateTextOptions = CatalogTaskActionOptions

/**
 * C5 P2 · 文本节点生成模式：
 * - append  续写：把生成内容接在文档末尾（默认；数据层，不依赖 editor，离屏也安全）。
 * - replace 重写：用生成内容替换整篇文档（数据层）。
 * - rewrite 改写：改写**当前选区**——这一种必须在节点编辑器里 replaceSelection（数据层拿不到
 *   ProseMirror 选区位置），所以 textActions 只打个标记，TextDocumentNode 的 effect 执行替换。
 */
export type TextGenMode = 'append' | 'replace' | 'rewrite'

export function getTextGenMode(node: Pick<GenerationCanvasNode, 'meta'>): TextGenMode {
  const mode = node.meta?.textGenMode
  return mode === 'replace' || mode === 'rewrite' ? mode : 'append'
}

export async function generateText(
  node: GenerationCanvasNode,
  options: GenerateTextOptions = {},
): Promise<GenerationNodeResult> {
  const userPrompt = (node.prompt || '').trim()
  const docText = docToPlainText(node.contentJson)
  const selText = typeof node.meta?.textGenSelection === 'string' ? node.meta.textGenSelection.trim() : ''
  // 改写但没有选区 → 退回续写（prompt 与落地都按续写）。
  const mode: TextGenMode = getTextGenMode(node) === 'rewrite' && !selText ? 'append' : getTextGenMode(node)

  const prompt = buildTextPrompt(mode, { userPrompt, docText, selText })
  const result = await runCatalogGenerationTask({ ...node, prompt }, options)
  const text = (result.text || '').trim()
  if (!text) return result

  if (mode === 'rewrite') {
    // 让节点内编辑器替换当前选区（见 TextDocumentNode 的 apply effect）。
    markPendingSelectionApply(node.id, result.id)
  } else if (mode === 'replace') {
    replaceNodeDocument(node.id, text)
  } else {
    appendTextToNodeDocument(node.id, text)
  }
  return result
}

/** 把 Tiptap 文档拍平成纯文本（数据层，不需要 editor）——用于喂给模型做上下文。 */
function docToPlainText(doc?: TiptapDocJson): string {
  const walk = (entry: unknown): string => {
    if (!entry || typeof entry !== 'object') return ''
    const node = entry as { type?: string; text?: string; content?: unknown[] }
    if (typeof node.text === 'string') return node.text
    if (Array.isArray(node.content)) return node.content.map(walk).join('')
    return ''
  }
  if (!doc || !Array.isArray(doc.content)) return ''
  // 每个块级节点之间用换行分隔。
  return doc.content
    .map(walk)
    .map((line) => line.trim())
    .filter(Boolean)
    .join('\n')
    .trim()
}

function buildTextPrompt(
  mode: TextGenMode,
  ctx: { userPrompt: string; docText: string; selText: string },
): string {
  const { userPrompt, docText, selText } = ctx
  if (mode === 'rewrite') {
    return [
      '请改写下面这段文字：',
      `"""\n${selText}\n"""`,
      `要求：${userPrompt || '保持原意，让它更通顺自然'}`,
      '只输出改写后的文字本身，不要解释、不要加引号。',
    ].join('\n')
  }
  if (mode === 'replace') {
    return [
      `请按下面的要求写一篇完整文本：${userPrompt || '自由发挥'}`,
      docText ? `（可参考现有内容：\n"""\n${docText}\n"""）` : '',
      '只输出正文本身，不要解释。',
    ].filter(Boolean).join('\n')
  }
  // append（续写）
  if (docText) {
    return [
      '这是当前文档内容：',
      `"""\n${docText}\n"""`,
      `请接着往下写${userPrompt ? `，要求：${userPrompt}` : ''}。`,
      '只输出新增的正文内容，不要重复已有内容，不要解释。',
    ].join('\n')
  }
  return [
    `请按要求写一段文本：${userPrompt || '自由发挥'}`,
    '只输出正文本身，不要解释。',
  ].join('\n')
}

/** 续写：读节点最新 contentJson，把新文本段落 append 到末尾后整体写回（持久化）。 */
function appendTextToNodeDocument(nodeId: string, text: string): void {
  const state = useGenerationCanvasStore.getState()
  const current = state.nodes.find((candidate) => candidate.id === nodeId)
  if (!current) return
  const existing = Array.isArray(current.contentJson?.content) ? current.contentJson!.content : []
  const appended = markdownToTiptapContent(text)
  if (!appended.length) return
  state.updateNode(nodeId, { contentJson: { type: 'doc', content: [...existing, ...appended] } })
}

/** 重写：用生成内容替换整篇文档（持久化）。 */
function replaceNodeDocument(nodeId: string, text: string): void {
  const appended = markdownToTiptapContent(text)
  if (!appended.length) return
  useGenerationCanvasStore.getState().updateNode(nodeId, { contentJson: { type: 'doc', content: appended } })
}

/** 改写：打标记，交给 TextDocumentNode 的 effect 用 editor.replaceSelection 落地（persist:false）。 */
function markPendingSelectionApply(nodeId: string, resultId: string): void {
  const state = useGenerationCanvasStore.getState()
  const current = state.nodes.find((candidate) => candidate.id === nodeId)
  state.updateNode(
    nodeId,
    { meta: { ...(current?.meta || {}), textPendingSelectionApply: resultId } },
    { persist: false },
  )
}

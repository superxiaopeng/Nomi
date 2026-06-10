import { beforeEach, describe, expect, it } from 'vitest'
import { generateText, getTextGenMode } from './textActions'
import { useGenerationCanvasStore } from '../store/generationCanvasStore'
import type { GenerationCanvasNode } from '../model/generationCanvasTypes'
import type { TaskResultDto } from '../../api/taskApi'

// 注入一个直接返回 chat 文本的 runTask，避免触网/desktop runtime。
const stubRun = async (): Promise<TaskResultDto> => ({
  id: 'task-1',
  kind: 'chat',
  status: 'succeeded',
  assets: [],
  raw: { choices: [{ message: { content: 'NEW TEXT' } }] },
})

function addTextNode(patch: Partial<GenerationCanvasNode> = {}): GenerationCanvasNode {
  const store = useGenerationCanvasStore.getState()
  const created = store.addNode({ kind: 'text', title: '', prompt: '要求', position: { x: 0, y: 0 } })
  store.updateNode(created.id, {
    meta: { modelVendor: 'v', modelKey: 'm', ...(patch.meta || {}) },
    ...(patch.contentJson ? { contentJson: patch.contentJson } : {}),
  })
  return useGenerationCanvasStore.getState().nodes.find((n) => n.id === created.id)!
}

function nodeText(id: string): string {
  const node = useGenerationCanvasStore.getState().nodes.find((n) => n.id === id)
  const content = (node?.contentJson?.content || []) as Array<{ content?: Array<{ text?: string }> }>
  return content.map((block) => (block.content || []).map((c) => c.text || '').join('')).join('\n')
}

beforeEach(() => {
  useGenerationCanvasStore.setState({ nodes: [], edges: [], selectedNodeIds: [], groups: [] })
})

describe('generateText — 生成模式路由', () => {
  it('getTextGenMode 默认 append，识别 replace/rewrite', () => {
    expect(getTextGenMode({ meta: undefined })).toBe('append')
    expect(getTextGenMode({ meta: { textGenMode: 'replace' } })).toBe('replace')
    expect(getTextGenMode({ meta: { textGenMode: 'rewrite' } })).toBe('rewrite')
    expect(getTextGenMode({ meta: { textGenMode: 'garbage' } })).toBe('append')
  })

  it('续写：append 到已有内容后面', async () => {
    const node = addTextNode({ contentJson: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: '开头' }] }] } })
    await generateText(node, { runTask: stubRun })
    expect(nodeText(node.id)).toBe('开头\nNEW TEXT')
  })

  it('重写：replace 整篇', async () => {
    const node = addTextNode({
      meta: { textGenMode: 'replace' },
      contentJson: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: '旧内容' }] }] },
    })
    await generateText(node, { runTask: stubRun })
    expect(nodeText(node.id)).toBe('NEW TEXT')
  })

  it('改写：不动文档，只打 textPendingSelectionApply 标记交给编辑器落地', async () => {
    const node = addTextNode({
      meta: { textGenMode: 'rewrite', textGenSelection: '要改的那段' },
      contentJson: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: '要改的那段' }] }] },
    })
    const result = await generateText(node, { runTask: stubRun })
    // 文档未变
    expect(nodeText(node.id)).toBe('要改的那段')
    // 标记 = 本次 result.id
    const after = useGenerationCanvasStore.getState().nodes.find((n) => n.id === node.id)
    expect(after?.meta?.textPendingSelectionApply).toBe(result.id)
  })

  it('改写但没有选区 → 退回续写（append）', async () => {
    const node = addTextNode({
      meta: { textGenMode: 'rewrite' },
      contentJson: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: '开头' }] }] },
    })
    await generateText(node, { runTask: stubRun })
    expect(nodeText(node.id)).toBe('开头\nNEW TEXT')
    const after = useGenerationCanvasStore.getState().nodes.find((n) => n.id === node.id)
    expect(after?.meta?.textPendingSelectionApply).toBeUndefined()
  })
})

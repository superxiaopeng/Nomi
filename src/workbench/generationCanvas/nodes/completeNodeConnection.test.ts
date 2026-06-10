import { beforeEach, describe, expect, it } from 'vitest'
import { useGenerationCanvasStore } from '../store/generationCanvasStore'
import { completeNodeConnection } from './completeNodeConnection'
import type { GenerationCanvasNode } from '../model/generationCanvasTypes'

// 捷径 B 集成测试（真 store + 真 orchestrator + 真路由，不 mock）：连线到「有数组槽的节点」=
// meta-only 写入数组、绝不落边（评审 M6）；其余目标 = 现状 connectToNode 边语义不动。

function imageNode(id: string, url?: string): GenerationCanvasNode {
  return {
    id, kind: 'image', title: id, position: { x: 0, y: 0 }, prompt: '',
    ...(url ? { result: { id: `${id}-r`, url } } : {}),
  } as GenerationCanvasNode
}
function omniVideoNode(id: string): GenerationCanvasNode {
  return {
    id, kind: 'video', title: id, position: { x: 400, y: 0 }, prompt: '',
    meta: { modelKey: 'seedance-2', archetype: { id: 'seedance-2', modeId: 'omni' } },
  } as GenerationCanvasNode
}
function plainVideoNode(id: string): GenerationCanvasNode {
  return { id, kind: 'video', title: id, position: { x: 400, y: 0 }, prompt: '', meta: {} } as GenerationCanvasNode
}

function seed(nodes: GenerationCanvasNode[]) {
  useGenerationCanvasStore.getState().restoreSnapshot({ nodes, edges: [], selectedNodeIds: [], groups: [] })
}
const refImages = (id: string) =>
  (useGenerationCanvasStore.getState().nodes.find((n) => n.id === id)?.meta?.referenceImageUrls as string[] | undefined)

beforeEach(() => seed([]))

describe('completeNodeConnection — 捷径 B', () => {
  it('image source(有结果) → omni target：写入 referenceImageUrls，不建边，清 pending', () => {
    seed([imageNode('src', 'https://cdn/x.png'), omniVideoNode('dst')])
    useGenerationCanvasStore.getState().startConnection('src')
    completeNodeConnection('dst')
    expect(refImages('dst')).toEqual(['https://cdn/x.png'])
    expect(useGenerationCanvasStore.getState().edges).toEqual([]) // meta-only：绝不落持久边
    expect(useGenerationCanvasStore.getState().pendingConnectionSourceId).toBe('')
  })

  it('普通 video target(无档案数组槽) → 回退 connectToNode：建边（首帧），不写数组', () => {
    seed([imageNode('src', 'https://cdn/x.png'), plainVideoNode('dst')])
    useGenerationCanvasStore.getState().startConnection('src')
    completeNodeConnection('dst')
    const edges = useGenerationCanvasStore.getState().edges
    expect(edges).toHaveLength(1)
    expect(edges[0]).toMatchObject({ source: 'src', target: 'dst', mode: 'first_frame' })
    expect(refImages('dst')).toBeUndefined()
  })

  it('source 还没生成(无结果 URL) → 不写空串、不建边、清 pending', () => {
    seed([imageNode('src'), omniVideoNode('dst')])
    useGenerationCanvasStore.getState().startConnection('src')
    completeNodeConnection('dst')
    expect(refImages('dst')).toBeUndefined()
    expect(useGenerationCanvasStore.getState().edges).toEqual([])
    expect(useGenerationCanvasStore.getState().pendingConnectionSourceId).toBe('')
  })

  it('同一 source 连两次 → 去重（单源 appendArchetypeArrayValue）', () => {
    seed([imageNode('src', 'https://cdn/x.png'), omniVideoNode('dst')])
    const store = useGenerationCanvasStore.getState()
    store.startConnection('src'); completeNodeConnection('dst')
    store.startConnection('src'); completeNodeConnection('dst')
    expect(refImages('dst')).toEqual(['https://cdn/x.png'])
  })
})

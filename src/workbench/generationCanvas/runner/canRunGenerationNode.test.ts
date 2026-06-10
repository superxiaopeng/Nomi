import { describe, it, expect } from 'vitest'
import { canRunGenerationNode } from './generationRunController'
import type { GenerationCanvasNode } from '../model/generationCanvasTypes'

// 回归：Seedance omni 视频节点放了参考数组就该「可生成」。修复前 canRunGenerationNode 只看
// 首/尾帧 + referenceImages，看不到 referenceImageUrls → omni 节点 ↑ 按钮被锁死、误提示「需要首帧」。

function videoNode(modeId: string, meta: Record<string, unknown> = {}): GenerationCanvasNode {
  return {
    id: 'v1', kind: 'video', title: 'v', position: { x: 0, y: 0 }, prompt: '',
    meta: { modelKey: 'seedance-2', archetype: { id: 'seedance-2', modeId }, ...meta },
  } as GenerationCanvasNode
}

describe('canRunGenerationNode — 视频节点参考判定', () => {
  it('omni 无任何参考 → 不可生成', () => {
    expect(canRunGenerationNode(videoNode('omni'), { nodes: [], edges: [] })).toBe(false)
  })
  it('omni 放了角色图数组 → 可生成（修复点）', () => {
    const node = videoNode('omni', { referenceImageUrls: ['https://cdn/c1.png'] })
    expect(canRunGenerationNode(node, { nodes: [node], edges: [] })).toBe(true)
  })
  it('omni 放了参考视频（nomi-local，传输前本地化）→ 可生成', () => {
    const node = videoNode('omni', { referenceVideoUrls: ['nomi-local://asset/p/v.mp4'] })
    expect(canRunGenerationNode(node, { nodes: [node], edges: [] })).toBe(true)
  })
  it('首帧模式：有 firstFrameUrl → 可生成；空 → 不可', () => {
    expect(canRunGenerationNode(videoNode('first', { firstFrameUrl: 'https://cdn/f.png' }), { nodes: [], edges: [] })).toBe(true)
    expect(canRunGenerationNode(videoNode('first'), { nodes: [], edges: [] })).toBe(false)
  })
  it('image / text 节点始终可生成（prompt 缺失由下游兜底）', () => {
    expect(canRunGenerationNode({ kind: 'image' } as GenerationCanvasNode)).toBe(true)
    expect(canRunGenerationNode({ kind: 'text' } as GenerationCanvasNode)).toBe(true)
  })
})

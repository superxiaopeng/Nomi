import { describe, expect, it } from 'vitest'
import { connectNodes } from './graphOps'
import type { GenerationCanvasEdge } from './generationCanvasTypes'

describe('connectNodes — 去重按 (source,target,mode)（治「同两点连不了第二种参考」R2）', () => {
  it('同 (source,target,mode) 重复 → no-op', () => {
    const base: GenerationCanvasEdge[] = [{ id: 'e1', source: 'a', target: 'b', mode: 'first_frame' }]
    expect(connectNodes(base, 'a', 'b', 'first_frame')).toBe(base)
  })

  it('同两点、不同 mode（首帧 + 尾帧）→ 都连得上', () => {
    const base: GenerationCanvasEdge[] = [{ id: 'e1', source: 'a', target: 'b', mode: 'first_frame' }]
    const next = connectNodes(base, 'a', 'b', 'last_frame')
    expect(next).toHaveLength(2)
    expect(next[1]).toMatchObject({ source: 'a', target: 'b', mode: 'last_frame' })
  })

  it('自连接 / 空端点 → no-op', () => {
    const base: GenerationCanvasEdge[] = []
    expect(connectNodes(base, 'a', 'a', 'reference')).toBe(base)
    expect(connectNodes(base, '', 'b', 'reference')).toBe(base)
  })
})

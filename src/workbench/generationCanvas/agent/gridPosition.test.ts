import { describe, expect, it } from 'vitest'
import { gridPosition } from './applyCanvasToolCall'

// L2 回归：agent 批量建节点的布局由渲染层 derive 成紧凑网格，
// 不再单行横排溢出视口（旧 bug：x = 160 + index*340 → 6 节点到 1860px）。
describe('gridPosition', () => {
  it('6 个节点排成 3 列 2 行，最右列不溢出（≤ 880px）', () => {
    const total = 6
    const xs = Array.from({ length: total }, (_, i) => gridPosition(i, total).x)
    const ys = Array.from({ length: total }, (_, i) => gridPosition(i, total).y)
    expect(Math.max(...xs)).toBeLessThanOrEqual(880) // 旧实现这里是 1860
    expect(new Set(ys).size).toBe(2) // 两行，而非单行
  })

  it('列数 = ceil(sqrt(n))：12 节点 → 4 列', () => {
    const total = 12
    const cols = Math.max(1, Math.ceil(Math.sqrt(total)))
    expect(cols).toBe(4)
    // 第 0 与第 4 个在同列不同行
    expect(gridPosition(0, total).x).toBe(gridPosition(4, total).x)
    expect(gridPosition(4, total).y).toBeGreaterThan(gridPosition(0, total).y)
  })

  it('单节点落在原点格', () => {
    expect(gridPosition(0, 1)).toEqual({ x: 160, y: 160 })
  })

  it('任意数量横向跨度都收敛（不随 index 线性发散）', () => {
    const total = 9
    const xs = Array.from({ length: total }, (_, i) => gridPosition(i, total).x)
    // 9 节点 3 列 → 跨度 = 2*360 = 720，远小于旧实现 8*340=2720
    expect(Math.max(...xs) - Math.min(...xs)).toBeLessThanOrEqual(720)
  })
})

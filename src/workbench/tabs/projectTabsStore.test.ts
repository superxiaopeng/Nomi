import { describe, expect, it } from 'vitest'
import { applyOpenTab, applyCloseTab, applyRenameTab, type ProjectTabsSnapshot } from './projectTabsStore'

const empty: ProjectTabsSnapshot = { tabs: [], activeId: null }
const A = { id: 'a', name: 'A' }
const B = { id: 'b', name: 'B' }
const C = { id: 'c', name: 'C' }

describe('projectTabs 纯逻辑', () => {
  it('openTab：新项目追加并激活', () => {
    const s1 = applyOpenTab(empty, A)
    expect(s1).toEqual({ tabs: [A], activeId: 'a' })
    const s2 = applyOpenTab(s1, B)
    expect(s2.tabs.map((t) => t.id)).toEqual(['a', 'b'])
    expect(s2.activeId).toBe('b')
  })

  it('同项目锁：重复 open 同 id → 只聚焦，不新建', () => {
    const s = applyOpenTab(applyOpenTab(applyOpenTab(empty, A), B), A)
    expect(s.tabs.map((t) => t.id)).toEqual(['a', 'b']) // 没有第二个 a
    expect(s.activeId).toBe('a') // 聚焦回 A
  })

  it('重复 open 同 id 但改了名 → 同步名', () => {
    const s = applyOpenTab(applyOpenTab(empty, A), { id: 'a', name: 'A 改名' })
    expect(s.tabs).toEqual([{ id: 'a', name: 'A 改名' }])
  })

  it('关活动标签 → 激活相邻(优先右)', () => {
    const base: ProjectTabsSnapshot = { tabs: [A, B, C], activeId: 'b' }
    expect(applyCloseTab(base, 'b')).toEqual({ tabs: [A, C], activeId: 'c' })
  })

  it('关最后一个活动标签 → 激活左邻', () => {
    const base: ProjectTabsSnapshot = { tabs: [A, B, C], activeId: 'c' }
    expect(applyCloseTab(base, 'c')).toEqual({ tabs: [A, B], activeId: 'b' })
  })

  it('关非活动标签 → 活动不变', () => {
    const base: ProjectTabsSnapshot = { tabs: [A, B, C], activeId: 'b' }
    expect(applyCloseTab(base, 'a')).toEqual({ tabs: [B, C], activeId: 'b' })
  })

  it('关掉最后一个标签 → activeId 归 null(回项目库)', () => {
    expect(applyCloseTab({ tabs: [A], activeId: 'a' }, 'a')).toEqual({ tabs: [], activeId: null })
  })

  it('renameTab 只改对应标签', () => {
    const s = applyRenameTab({ tabs: [A, B], activeId: 'a' }, 'b', 'B2')
    expect(s.tabs).toEqual([A, { id: 'b', name: 'B2' }])
  })
})

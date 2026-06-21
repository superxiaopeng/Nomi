import { create } from 'zustand'

// 多项目标签页（#4-a 阶段一）：app 级「当前打开的项目集」，独立于 per-project workbenchStore（分层 R9）。
// 一次活一个项目（切标签 = 项目加载，不动 workbenchStore 架构）；同项目只占一个标签（数据安全硬线）。
// 持久化到 localStorage，重开 app 恢复标签。

export type ProjectTab = { id: string; name: string }

export type ProjectTabsSnapshot = { tabs: ProjectTab[]; activeId: string | null }

const STORAGE_KEY = 'nomi.project-tabs.v1'

// ── 纯函数（可零依赖单测；store 只是包一层 + 持久化）──

/** 打开/聚焦：已存在(按 id)→ 只激活 + 同步名；否则追加 + 激活。同项目锁的落点（不新建重复标签）。 */
export function applyOpenTab(state: ProjectTabsSnapshot, tab: ProjectTab): ProjectTabsSnapshot {
  const existing = state.tabs.find((t) => t.id === tab.id)
  if (existing) {
    const tabs = existing.name === tab.name ? state.tabs : state.tabs.map((t) => (t.id === tab.id ? { ...t, name: tab.name } : t))
    return { tabs, activeId: tab.id }
  }
  return { tabs: [...state.tabs, tab], activeId: tab.id }
}

/** 关标签：移除；若关的是活动标签 → 激活相邻（优先右、否则左）；空了 → activeId=null。 */
export function applyCloseTab(state: ProjectTabsSnapshot, id: string): ProjectTabsSnapshot {
  const idx = state.tabs.findIndex((t) => t.id === id)
  if (idx === -1) return state
  const tabs = state.tabs.filter((t) => t.id !== id)
  if (state.activeId !== id) return { tabs, activeId: state.activeId }
  if (tabs.length === 0) return { tabs, activeId: null }
  const next = tabs[Math.min(idx, tabs.length - 1)]
  return { tabs, activeId: next.id }
}

export function applyRenameTab(state: ProjectTabsSnapshot, id: string, name: string): ProjectTabsSnapshot {
  return { ...state, tabs: state.tabs.map((t) => (t.id === id ? { ...t, name } : t)) }
}

// ── 持久化 ──

function load(): ProjectTabsSnapshot {
  if (typeof window === 'undefined') return { tabs: [], activeId: null }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return { tabs: [], activeId: null }
    const parsed = JSON.parse(raw) as ProjectTabsSnapshot
    const tabs = Array.isArray(parsed.tabs)
      ? parsed.tabs.filter((t): t is ProjectTab => Boolean(t) && typeof t.id === 'string' && typeof t.name === 'string')
      : []
    const activeId = tabs.some((t) => t.id === parsed.activeId) ? parsed.activeId : (tabs[0]?.id ?? null)
    return { tabs, activeId }
  } catch {
    return { tabs: [], activeId: null }
  }
}

function persist(snapshot: ProjectTabsSnapshot): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot))
  } catch {
    // 配额/隐私模式失败：标签持久化是便利，不阻断
  }
}

type ProjectTabsState = ProjectTabsSnapshot & {
  /** 打开/聚焦项目标签（同项目不新建，只聚焦）。 */
  openTab: (tab: ProjectTab) => void
  /** 关闭标签，返回应导航到的新 activeId（null = 回项目库）。 */
  closeTab: (id: string) => string | null
  setActive: (id: string) => void
  renameTab: (id: string, name: string) => void
}

const initial = load()

export const useProjectTabsStore = create<ProjectTabsState>((set, get) => ({
  tabs: initial.tabs,
  activeId: initial.activeId,
  openTab: (tab) => {
    const next = applyOpenTab(get(), tab)
    persist(next)
    set(next)
  },
  closeTab: (id) => {
    const next = applyCloseTab(get(), id)
    persist(next)
    set(next)
    return next.activeId
  },
  setActive: (id) => {
    if (!get().tabs.some((t) => t.id === id)) return
    const next = { tabs: get().tabs, activeId: id }
    persist(next)
    set({ activeId: id })
  },
  renameTab: (id, name) => {
    const next = applyRenameTab(get(), id, name)
    persist(next)
    set({ tabs: next.tabs })
  },
}))

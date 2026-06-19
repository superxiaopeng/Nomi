/**
 * 开屏动画 + 上手清单的持久标记（跨会话）。
 *
 * 走 localStorage（不进 workbenchStore——那边的持久化绑定项目存档）。
 * try/catch 守护：localStorage 不可用时 splash 退化为「已看过」
 *（避免每次都拦首启），清单退化为全 false。
 */

const SPLASH_KEY = 'nomi:splash:v1'
const CHECKLIST_KEY = 'nomi:checklist:v1'
const CHECKLIST_COLLAPSED_KEY = 'nomi:checklist-collapsed:v1'
const CANVAS_GESTURE_HINT_KEY = 'nomi:canvas-gesture-hint:v1'

export function hasSeenCanvasGestureHint(): boolean {
  try {
    return window.localStorage.getItem(CANVAS_GESTURE_HINT_KEY) === 'seen'
  } catch {
    // localStorage 不可用：退化为「已看过」，不反复弹手势卡
    return true
  }
}

export function markCanvasGestureHintSeen(): void {
  try {
    window.localStorage.setItem(CANVAS_GESTURE_HINT_KEY, 'seen')
  } catch {
    /* ignore */
  }
}

export type ChecklistStep = 'model' | 'storyboard' | 'generated' | 'exported'
export type ChecklistState = Record<ChecklistStep, boolean>

const EMPTY: ChecklistState = { model: false, storyboard: false, generated: false, exported: false }

export function hasSeenSplash(): boolean {
  try {
    return window.localStorage.getItem(SPLASH_KEY) === 'seen'
  } catch {
    // localStorage 不可用：退化为「已看过」，不拦首启
    return true
  }
}

export function markSplashSeen(): void {
  try {
    window.localStorage.setItem(SPLASH_KEY, 'seen')
  } catch {
    /* ignore */
  }
}

export function readChecklist(): ChecklistState {
  try {
    const raw = window.localStorage.getItem(CHECKLIST_KEY)
    if (!raw) return { ...EMPTY }
    const parsed = JSON.parse(raw) as Partial<ChecklistState>
    return { ...EMPTY, ...parsed }
  } catch {
    return { ...EMPTY }
  }
}

export function markChecklistStep(step: ChecklistStep): void {
  try {
    const state = readChecklist()
    state[step] = true
    window.localStorage.setItem(CHECKLIST_KEY, JSON.stringify(state))
  } catch {
    /* ignore */
  }
}

/** 清单折叠态（跨会话记住用户上次是否收起；默认展开）。 */
export function readChecklistCollapsed(): boolean {
  try {
    return window.localStorage.getItem(CHECKLIST_COLLAPSED_KEY) === '1'
  } catch {
    return false
  }
}

export function writeChecklistCollapsed(collapsed: boolean): void {
  try {
    window.localStorage.setItem(CHECKLIST_COLLAPSED_KEY, collapsed ? '1' : '0')
  } catch {
    /* ignore */
  }
}

import React from 'react'
import { getDesktopBridge } from '../../desktop/bridge'
import type { DesktopAppInfo, DesktopUpdateEvent } from '../../desktop/bridge'

// 版本号 + 检查更新 + 一键更新（功能需求1/2/3）的渲染层状态机。
// UI 纯 derive 自 phase，不在组件里 hardcode 文案分支（单一真相源）。

export type UpdaterPhase =
  | 'idle'
  | 'checking'
  | 'up-to-date'
  | 'available'
  | 'downloading'
  | 'downloaded'
  | 'error'

export type Updater = {
  phase: UpdaterPhase
  appInfo: DesktopAppInfo | null
  latestVersion: string | null
  notes: string
  percent: number
  errorMessage: string
  /** 桌面端且主进程暴露了 update 桥才支持检查/更新（Web 预览态只显示版本号）。 */
  supported: boolean
  check: () => void
  download: () => void
  install: () => void
  reset: () => void
}

export type UpdaterReducerState = {
  phase: UpdaterPhase
  latestVersion: string | null
  notes: string
  percent: number
  errorMessage: string
}

type State = UpdaterReducerState

export const UPDATER_INITIAL_STATE: State = { phase: 'idle', latestVersion: null, notes: '', percent: 0, errorMessage: '' }

const INITIAL = UPDATER_INITIAL_STATE

export function reduceUpdaterState(state: State, event: DesktopUpdateEvent): State {
  switch (event.type) {
    case 'checking':
      return { ...INITIAL, phase: 'checking' }
    case 'up-to-date':
      return { ...INITIAL, phase: 'up-to-date' }
    case 'available':
      return { ...INITIAL, phase: 'available', latestVersion: event.version, notes: event.notes }
    case 'progress':
      return { ...state, phase: 'downloading', percent: event.percent }
    case 'downloaded':
      return { ...state, phase: 'downloaded', latestVersion: event.version || state.latestVersion }
    case 'error':
      return { ...state, phase: 'error', errorMessage: event.message }
    default:
      return state
  }
}

export function useUpdater(): Updater {
  const bridge = getDesktopBridge()
  const update = bridge?.update
  const supported = Boolean(update)

  const [appInfo, setAppInfo] = React.useState<DesktopAppInfo | null>(null)
  const [state, setState] = React.useState<State>(INITIAL)

  React.useEffect(() => {
    let alive = true
    void update?.appInfo().then((info) => {
      if (alive) setAppInfo(info)
    }).catch(() => undefined)
    const off = update?.onEvent((event) => setState((prev) => reduceUpdaterState(prev, event)))
    return () => {
      alive = false
      off?.()
    }
  }, [update])

  // 「已是最新」短暂提示后自动回落到 idle（与样张一致）。
  React.useEffect(() => {
    if (state.phase !== 'up-to-date') return
    const timer = window.setTimeout(() => setState(INITIAL), 2500)
    return () => window.clearTimeout(timer)
  }, [state.phase])

  const check = React.useCallback(() => {
    setState({ ...INITIAL, phase: 'checking' })
    void update?.check().catch(() => undefined)
  }, [update])

  const download = React.useCallback(() => {
    setState((prev) => ({ ...prev, phase: 'downloading', percent: 0 }))
    void update?.download().catch(() => undefined)
  }, [update])

  const install = React.useCallback(() => {
    void update?.install().catch(() => undefined)
  }, [update])

  const reset = React.useCallback(() => setState(INITIAL), [])

  return {
    phase: state.phase,
    appInfo,
    latestVersion: state.latestVersion,
    notes: state.notes,
    percent: state.percent,
    errorMessage: state.errorMessage,
    supported,
    check,
    download,
    install,
    reset,
  }
}

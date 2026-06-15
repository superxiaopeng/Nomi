import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  hasSeenSplash,
  markSplashSeen,
  readChecklist,
  markChecklistStep,
  readChecklistCollapsed,
  writeChecklistCollapsed,
} from './onboardingState'

// 测试环境是 node（无 jsdom），用最小 localStorage 桩模拟 window（照 activeProject.test.ts）。
const store = new Map<string, string>()
const localStorageStub = {
  getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
  clear: () => void store.clear(),
}

beforeEach(() => {
  store.clear()
  vi.stubGlobal('window', { localStorage: localStorageStub })
})
afterEach(() => vi.unstubAllGlobals())

describe('onboardingState', () => {
  it('splash 默认未看过，标记后为 true', () => {
    expect(hasSeenSplash()).toBe(false)
    markSplashSeen()
    expect(hasSeenSplash()).toBe(true)
  })

  it('清单步骤累积打勾', () => {
    expect(readChecklist().model).toBe(false)
    markChecklistStep('model')
    expect(readChecklist().model).toBe(true)
    expect(readChecklist().exported).toBe(false)
  })

  it('多步打勾互不覆盖', () => {
    markChecklistStep('model')
    markChecklistStep('exported')
    const state = readChecklist()
    expect(state.model).toBe(true)
    expect(state.exported).toBe(true)
    expect(state.storyboard).toBe(false)
    expect(state.generated).toBe(false)
  })

  it('readChecklist 容错坏 JSON，回退到全 false', () => {
    localStorageStub.setItem('nomi:checklist:v1', '{not json')
    expect(readChecklist()).toEqual({
      model: false,
      storyboard: false,
      generated: false,
      exported: false,
    })
  })

  it('折叠态默认展开（false），写入后可读回', () => {
    expect(readChecklistCollapsed()).toBe(false)
    writeChecklistCollapsed(true)
    expect(readChecklistCollapsed()).toBe(true)
    writeChecklistCollapsed(false)
    expect(readChecklistCollapsed()).toBe(false)
  })
})

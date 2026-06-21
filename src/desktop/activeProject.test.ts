import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getDesktopActiveProjectId, setDesktopActiveProjectId } from './activeProject'

const KEY = 'nomi-workbench-last-active-project-v1'

// 测试环境是 node（无 jsdom），用最小 localStorage 桩模拟 window。
const store = new Map<string, string>()
const localStorageStub = {
  getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
}

describe('getDesktopActiveProjectId（projectId 缺失窗口的兜底）', () => {
  beforeEach(() => {
    store.clear()
    vi.stubGlobal('window', { localStorage: localStorageStub })
    setDesktopActiveProjectId('')
  })
  afterEach(() => {
    setDesktopActiveProjectId('')
    vi.unstubAllGlobals()
  })

  it('内存全局有值时直接返回它', () => {
    setDesktopActiveProjectId(' proj-A ')
    expect(getDesktopActiveProjectId()).toBe('proj-A')
  })

  it('内存为空（React effect 还没赋值的窗口）→ 回退到持久化的 last-active id', () => {
    setDesktopActiveProjectId('')
    store.set(KEY, 'proj-persisted')
    // 这正是修复点：以前这里返回空 → 生成图拿到会过期的厂商临时 URL、上传退回 base64
    expect(getDesktopActiveProjectId()).toBe('proj-persisted')
  })

  it('内存有值时优先于持久化值', () => {
    setDesktopActiveProjectId('proj-current')
    store.set(KEY, 'proj-stale')
    expect(getDesktopActiveProjectId()).toBe('proj-current')
  })

  it('两者都空时返回空字符串（不抛错）', () => {
    expect(getDesktopActiveProjectId()).toBe('')
  })
})

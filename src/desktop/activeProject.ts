let activeProjectId = ''

// 与 projectPersistenceService.LAST_ACTIVE_PROJECT_KEY 同一把钥匙：每次项目 hydrate/保存
// 都会写入当前项目 id，是「当前打开的是哪个项目」的权威、同步、跨刷新可读的真相源。
const LAST_ACTIVE_PROJECT_KEY = 'nomi-workbench-last-active-project-v1'

export function setDesktopActiveProjectId(projectId: string | null | undefined): void {
  activeProjectId = typeof projectId === 'string' ? projectId.trim() : ''
}

function readPersistedActiveProjectId(): string {
  if (typeof window === 'undefined') return ''
  try {
    return (window.localStorage.getItem(LAST_ACTIVE_PROJECT_KEY) || '').trim()
  } catch {
    return ''
  }
}

// 取当前活动项目 id。
//
// 内存里的 activeProjectId 由 React effect 赋值，比 React state 慢一个周期——在「app 刚
// 启动 / 刚切项目」的窗口里它可能还是空。这一刻若发生上传/生成，projectId 缺失会导致：
// 生成图保留厂商临时 URL（隔天过期消失）、上传图退回 base64。所以内存为空时回退到
// 持久化的 last-active id（hydrate 时已同步写入），堵住这个静默丢图的窗口。
export function getDesktopActiveProjectId(): string {
  return activeProjectId || readPersistedActiveProjectId()
}

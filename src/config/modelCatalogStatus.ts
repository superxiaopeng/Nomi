import type {
  BillingModelKind,
  ModelCatalogHealthDto,
} from '../workbench/api/modelCatalogApi'
import type { ModelOption, NodeKind } from './models'

export function resolveCatalogKind(kind?: NodeKind): BillingModelKind {
  if (kind === 'image' || kind === 'imageEdit') {
    return 'image'
  }
  if (kind === 'video') {
    return 'video'
  }
  if (kind === 'audio') {
    return 'audio'
  }
  return 'text'
}

export function normalizeCatalogLoadError(caught: unknown): Error {
  if (caught instanceof Error) {
    const message = caught.message.trim()
    if (
      caught instanceof TypeError ||
      /failed to fetch|networkerror|load failed|fetch failed/i.test(message)
    ) {
      return new Error('本地模型目录不可用：请打开模型接入并检查桌面运行时。')
    }
    return caught
  }
  return new Error('模型目录加载失败')
}

export type ModelCatalogStatus =
  | 'loading'
  | 'api_unreachable'
  | 'catalog_empty'
  | 'kind_empty'
  | 'incomplete'
  | 'ready'

export function deriveModelCatalogStatus(input: {
  kind?: NodeKind
  options: readonly ModelOption[]
  health: ModelCatalogHealthDto | null
  error: Error | null
  healthError?: Error | null
  loading: boolean
}): { status: ModelCatalogStatus; message: string } {
  if (input.loading) {
    return { status: 'loading', message: '正在读取模型目录...' }
  }
  if (input.error) {
    return { status: 'api_unreachable', message: `模型目录加载失败：${input.error.message}` }
  }
  if (input.healthError) {
    return { status: 'api_unreachable', message: `模型目录健康检查失败：${input.healthError.message}` }
  }
  const catalogKind = resolveCatalogKind(input.kind)
  const health = input.health
  if (health?.issues.some((issue) => issue.code === 'catalog_empty' && issue.severity === 'error')) {
    return { status: 'catalog_empty', message: '模型目录为空' }
  }
  const kindSummary = health?.byKind.find((item) => item.kind === catalogKind)
  if (kindSummary && kindSummary.enabledModels === 0) {
    const label = catalogKind === 'image' ? '图像' : catalogKind === 'video' ? '视频' : '文本'
    return { status: 'kind_empty', message: `没有可用${label}模型` }
  }
  if (
    health?.issues.some((issue) =>
      issue.severity === 'error' &&
      (issue.kind === catalogKind || typeof issue.kind === 'undefined')
    )
  ) {
    return { status: 'incomplete', message: '模型目录配置不完整' }
  }
  if (input.options.length === 0) {
    const label = catalogKind === 'image' ? '图像' : catalogKind === 'video' ? '视频' : '文本'
    return { status: 'kind_empty', message: `没有可用${label}模型` }
  }
  return { status: 'ready', message: '模型目录可用' }
}

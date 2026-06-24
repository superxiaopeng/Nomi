import {
  hostedAssetUrl,
  importWorkbenchLocalAssetFile,
  recoverImportedWorkbenchLocalAssetFile,
  type WorkbenchAssetDto,
} from '../../api/assetUploadApi'
import type { GenerationCanvasNode } from '../model/generationCanvasTypes'
import { dropKindFromMime } from '../model/nodeAssetDrop'
import { readVideoDurationSeconds } from '../../../media/videoDurationProbe'
import { useGenerationCanvasStore } from '../store/generationCanvasStore'

export const GENERATION_CANVAS_IMAGE_IMPORT_MAX_BYTES = 30 * 1024 * 1024
// 视频文件远大于图片，单独给宽上限；本地优先 App，用户导入自己的片段。
export const GENERATION_CANVAS_VIDEO_IMPORT_MAX_BYTES = 600 * 1024 * 1024
const DATA_URL_FALLBACK_MAX_BYTES = 512 * 1024

export type GenerationAssetImportItem = {
  node: GenerationCanvasNode
  file: File
  kind: 'image' | 'video'
}

export type GenerationAssetImportResult = {
  created: GenerationAssetImportItem[]
  skippedDuplicateCount: number
  skippedTooLargeCount: number
  /** 单次拖入超过 MAX_IMPORT_FILES 被截断丢弃的数量（C5：此前静默丢，无任何提示）。 */
  skippedOverLimitCount: number
  /** 上传/落盘失败、最终落 error 态的数量（让调用方提示「N 张导入失败」）。 */
  failedCount: number
}

export type ImportImageFilesOptions = {
  basePosition: { x: number; y: number }
  categoryId?: string
  createObjectUrl?: (file: File) => string
  revokeObjectUrl?: (url: string) => void
  readImageDimensions?: (url: string) => Promise<ImageDimensions | null>
  readVideoDuration?: (url: string) => Promise<number | null>
  uploadFile?: typeof importWorkbenchLocalAssetFile
  recoverFile?: typeof recoverImportedWorkbenchLocalAssetFile
}

type ImageDimensions = {
  width: number
  height: number
}

function isValidImageDimensions(value: ImageDimensions | null): value is ImageDimensions {
  return Boolean(
    value &&
    Number.isFinite(value.width) &&
    Number.isFinite(value.height) &&
    value.width > 0 &&
    value.height > 0,
  )
}

function previewHeightForDimensions(dimensions: ImageDimensions): number {
  const nodeWidth = nodeWidthForDimensions(dimensions)
  const rawHeight = Math.round(nodeWidth * (dimensions.height / dimensions.width))
  return Math.min(520, Math.max(120, rawHeight))
}

function nodeWidthForDimensions(dimensions: ImageDimensions): number {
  const aspectRatio = dimensions.width / dimensions.height
  if (aspectRatio >= 1.75) return 420
  if (aspectRatio <= 0.72) return 260
  return 340
}

function nodeSizeForDimensions(dimensions: ImageDimensions | null): { width: number; height: number } | undefined {
  if (!isValidImageDimensions(dimensions)) return undefined
  return {
    width: nodeWidthForDimensions(dimensions),
    height: previewHeightForDimensions(dimensions) + 188,
  }
}

function imageMetaForDimensions(dimensions: ImageDimensions | null): Record<string, unknown> {
  if (!isValidImageDimensions(dimensions)) return {}
  return {
    imageWidth: dimensions.width,
    imageHeight: dimensions.height,
    imageAspectRatio: dimensions.width / dimensions.height,
    previewHeight: previewHeightForDimensions(dimensions),
  }
}

function readBrowserImageDimensions(url: string): Promise<ImageDimensions | null> {
  if (typeof Image === 'undefined') return Promise.resolve(null)
  return new Promise((resolve) => {
    const image = new Image()
    image.onload = () => {
      resolve({
        width: image.naturalWidth || image.width,
        height: image.naturalHeight || image.height,
      })
    }
    image.onerror = () => resolve(null)
    image.src = url
  })
}

function fileSignature(file: File): string {
  return [
    file.name || '',
    file.type || '',
    typeof file.size === 'number' ? file.size : 0,
  ].join('|')
}

function deriveLabelFromFileName(fileName: string): string {
  const cleaned = String(fileName || '').replace(/\.[^.]+$/, '').trim()
  return cleaned || '参考图片'
}

function readFileDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : ''
      if (result) resolve(result)
      else reject(new Error('failed to read image data url'))
    }
    reader.onerror = () => reject(new Error('failed to read image data url'))
    reader.readAsDataURL(file)
  })
}

/** 仅 image / video 可导入为画布素材节点（音频暂无可落节点，过滤掉）。 */
function importKindForFile(file: File): 'image' | 'video' | null {
  const kind = dropKindFromMime(file.type)
  return kind === 'image' || kind === 'video' ? kind : null
}

export function filterImportableMediaFiles(files: File[]): {
  files: File[]
  skippedDuplicateCount: number
  skippedTooLargeCount: number
} {
  const seen = new Set<string>()
  let skippedDuplicateCount = 0
  let skippedTooLargeCount = 0
  const out: File[] = []
  for (const file of files) {
    const kind = importKindForFile(file)
    if (!kind) continue
    const signature = fileSignature(file)
    if (seen.has(signature)) {
      skippedDuplicateCount += 1
      continue
    }
    seen.add(signature)
    const maxBytes = kind === 'video' ? GENERATION_CANVAS_VIDEO_IMPORT_MAX_BYTES : GENERATION_CANVAS_IMAGE_IMPORT_MAX_BYTES
    if ((typeof file.size === 'number' ? file.size : 0) > maxBytes) {
      skippedTooLargeCount += 1
      continue
    }
    out.push(file)
  }
  return { files: out, skippedDuplicateCount, skippedTooLargeCount }
}

export async function importLocalMediaFilesToGenerationCanvas(
  inputFiles: File[],
  options: ImportImageFilesOptions,
): Promise<GenerationAssetImportResult> {
  const createObjectUrl = options.createObjectUrl ?? ((file: File) => URL.createObjectURL(file))
  const revokeObjectUrl = options.revokeObjectUrl ?? ((url: string) => URL.revokeObjectURL(url))
  const readImageDimensions = options.readImageDimensions ?? readBrowserImageDimensions
  const probeVideoDuration = options.readVideoDuration ?? readVideoDurationSeconds
  const uploadFile = options.uploadFile ?? importWorkbenchLocalAssetFile
  const recoverFile = options.recoverFile ?? recoverImportedWorkbenchLocalAssetFile
  const filtered = filterImportableMediaFiles(inputFiles)
  const created: GenerationAssetImportItem[] = []
  // 单次拖入上限：超出截断（C5：此前 .slice(0,8) 静默丢，无提示）。
  const MAX_IMPORT_FILES = 8
  const accepted = filtered.files.slice(0, MAX_IMPORT_FILES)
  const skippedOverLimitCount = filtered.files.length - accepted.length

  await Promise.all(accepted.map(async (file, index) => {
    const kind = importKindForFile(file) ?? 'image'
    // 视频不在导入时离屏读尺寸（节点渲染的 onLoadedMetadata 会回填 W/H + 真实时长，单源 catch-all）；
    // 图片仍即时读尺寸以定节点初始大小。
    let dimensions: ImageDimensions | null = null
    if (kind === 'image') {
      const objectUrl = createObjectUrl(file)
      dimensions = await readImageDimensions(objectUrl)
      revokeObjectUrl(objectUrl)
    }
    const size = nodeSizeForDimensions(dimensions)
    const node = useGenerationCanvasStore.getState().addNode({
      kind: 'asset',
      title: file.name || (kind === 'video' ? '参考视频' : '参考图片'),
      prompt: '',
      position: {
        x: Math.max(40, Math.round(options.basePosition.x + index * 28)),
        y: Math.max(40, Math.round(options.basePosition.y + index * 28)),
      },
      categoryId: options.categoryId,
    })
    useGenerationCanvasStore.getState().updateNode(node.id, {
      ...(size ? { size } : {}),
      status: 'queued',
      meta: {
        ...(node.meta || {}),
        source: 'local-drop',
        fileName: file.name,
        uploadStatus: 'uploading',
        ...imageMetaForDimensions(dimensions),
      },
    }, { persist: false })
    created.push({ node, file, kind })
  }))

  let failedCount = 0
  await Promise.all(created.map(async ({ node, file, kind }) => {
    let hosted: WorkbenchAssetDto | null = null
    try {
      hosted = await uploadFile(file, deriveLabelFromFileName(file.name), { ownerNodeId: node.id })
    } catch {
      hosted = await recoverFile(file)
    }
    const hostedUrl = hostedAssetUrl(hosted)
    if (!hostedUrl) {
      const canPersistSmallFallbackPre = kind === 'image' && (typeof file.size === 'number' ? file.size : 0) <= DATA_URL_FALLBACK_MAX_BYTES
      if (!canPersistSmallFallbackPre) failedCount += 1 // 无 data-url 兜底 → 真失败,计入提示
      // 图片可在极小阈值内退化成 data-url 落盘；视频体积过大，不做 data-url 兜底（直接报错让用户重导）。
      const canPersistSmallFallback = kind === 'image' && (typeof file.size === 'number' ? file.size : 0) <= DATA_URL_FALLBACK_MAX_BYTES
      const fallbackResult = canPersistSmallFallback
        ? {
            id: `local-${node.id}-${Date.now()}`,
            type: 'image' as const,
            url: await readFileDataUrl(file),
            createdAt: Date.now(),
          }
        : null
      useGenerationCanvasStore.getState().updateNode(node.id, {
        ...(fallbackResult ? { result: fallbackResult, history: [fallbackResult] } : {}),
        status: fallbackResult ? 'success' : 'error',
        error: fallbackResult ? undefined : '本地素材复制失败，请重新导入',
        meta: {
          ...(useGenerationCanvasStore.getState().nodes.find((candidate) => candidate.id === node.id)?.meta || {}),
          uploadStatus: 'local-only',
          localOnly: true,
          persistable: Boolean(fallbackResult),
        },
      })
      return
    }
    // 视频：导入即离屏测真实时长写 meta.videoDuration，消除「渲染前就拖到时间轴」的竞态
    // （节点渲染的 onLoadedMetadata 仍会二次自愈，两处同一真相键）。
    const videoDuration = kind === 'video' ? await probeVideoDuration(hostedUrl) : null
    const hostedResult = {
      id: `asset-${node.id}-${hosted?.id || Date.now()}`,
      type: kind,
      url: hostedUrl,
      assetId: hosted?.id,
      raw: { asset: hosted },
      createdAt: Date.now(),
    }
    useGenerationCanvasStore.getState().updateNode(node.id, {
      result: hostedResult,
      history: [hostedResult],
      status: 'success',
      meta: {
        ...(useGenerationCanvasStore.getState().nodes.find((candidate) => candidate.id === node.id)?.meta || {}),
        source: 'asset-upload',
        uploadStatus: 'uploaded',
        localOnly: false,
        serverAssetId: hosted?.id,
        ...(videoDuration && videoDuration > 0 ? { videoDuration } : {}),
      },
    })
  }))

  return {
    created,
    skippedDuplicateCount: filtered.skippedDuplicateCount,
    skippedTooLargeCount: filtered.skippedTooLargeCount,
    skippedOverLimitCount,
    failedCount,
  }
}

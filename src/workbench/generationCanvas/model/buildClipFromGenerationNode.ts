import type { TimelineClip, TimelineClipType } from '../../timeline/timelineTypes'
import type { GenerationCanvasNode, GenerationNodeResult } from './generationCanvasTypes'
import { getGenerationNodeExecutionKind } from './generationNodeKinds'

const DEFAULT_IMAGE_SECONDS = 3
const DEFAULT_VIDEO_SECONDS = 5

type BuildClipOptions = {
  fps?: number
  startFrame?: number
  resultId?: string
}

function readString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function readPositiveNumber(value: unknown): number | null {
  const next = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(next) && next > 0 ? next : null
}

function normalizeFrame(value: unknown): number {
  const next = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(next) ? Math.max(0, Math.floor(next)) : 0
}

function resolveSelectedResult(node: GenerationCanvasNode, resultId?: string): GenerationNodeResult | null {
  const selectedResultId = readString(resultId)
  if (!selectedResultId) return node.result || null
  return (node.history || []).find((result) => result.id === selectedResultId) || null
}

function resolveClipType(node: GenerationCanvasNode, result: GenerationNodeResult | null): TimelineClipType {
  // v0.7.1: audio category 优先级最高（即使 kind 占位是 image）
  if (node.categoryId === 'audio') return 'audio'
  if (result?.type === 'image' || result?.type === 'video') return result.type
  const executionKind = getGenerationNodeExecutionKind(node.kind)
  if (executionKind === 'image') return 'image'
  if (executionKind === 'video') return 'video'
  return 'image'
}

function resolveFrameCount(type: TimelineClipType, result: GenerationNodeResult | null, fps: number): number {
  if (type === 'image') return DEFAULT_IMAGE_SECONDS * fps
  // v0.7.1: audio 默认 5 秒（与 video 一致），未来读 meta.durationSec
  const seconds = readPositiveNumber(result?.durationSeconds) || DEFAULT_VIDEO_SECONDS
  return Math.max(1, Math.round(seconds * fps))
}

function buildClipId(nodeId: string, type: TimelineClipType, startFrame: number, result: GenerationNodeResult | null): string {
  const resultPart = result?.id ? `-${result.id}` : ''
  return `clip-${nodeId}${resultPart}-${type}-${startFrame}`
}

function isBlockedByActiveStatus(node: GenerationCanvasNode, resultId?: string): boolean {
  if (node.status !== 'queued' && node.status !== 'running' && node.status !== 'error') return false
  return !readString(resultId)
}

export function buildClipFromGenerationNode(node: GenerationCanvasNode, options?: BuildClipOptions): TimelineClip | null {
  if (!node?.id) return null
  if (isBlockedByActiveStatus(node, options?.resultId)) return null

  const result = resolveSelectedResult(node, options?.resultId)
  if (options?.resultId && !result) return null

  const fps = readPositiveNumber(options?.fps) || 30
  const startFrame = normalizeFrame(options?.startFrame)
  const type = resolveClipType(node, result)
  const label = readString(node.title) || readString(node.prompt) || node.id
  const url = readString(result?.url)
  const thumbnailUrl = readString(result?.thumbnailUrl) || (type === 'image' ? url : '')

  // v0.7.1: image / video / audio 都要求有 url（生成或上传后才允许拖）
  if (!url) return null

  const frameCount = resolveFrameCount(type, result, fps)

  return {
    id: buildClipId(node.id, type, startFrame, result),
    type,
    sourceNodeId: node.id,
    label,
    startFrame,
    endFrame: startFrame + frameCount,
    frameCount,
    offsetStartFrame: 0,
    offsetEndFrame: 0,
    ...(url ? { url } : {}),
    ...(thumbnailUrl ? { thumbnailUrl } : {}),
  }
}

import type { ExportPreset, ExportQuality, ExportResolution } from '../../../electron/export/exportTypes'
import type { TimelineState } from '../timeline/timelineTypes'
import type { PreviewAspectRatio } from '../workbenchTypes'

export type {
  ExportAspectRatio,
  ExportJobStatus,
  ExportPreset,
  ExportProfile,
  ExportQuality,
  ExportResolution,
  ExportStage,
} from '../../../electron/export/exportTypes'

export type ExportRequest = {
  projectId: string
  timeline: TimelineState
  aspectRatio: PreviewAspectRatio
  preset: ExportPreset
  resolution: ExportResolution
  quality: ExportQuality
  outputName?: string
}

export type DesktopMp4ExportStartPayload = {
  projectId: string
  webmBytes: ArrayBuffer
  outputName?: string
  resolution?: Exclude<ExportResolution, 'source'>
  aspectRatio?: PreviewAspectRatio
  quality?: ExportQuality
  fps?: number
}

export type DesktopMp4ExportResult = {
  absolutePath: string
  relativePath: string
  size: number
}

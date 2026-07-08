// 运镜小片的全局出图 Host：常驻挂载（不随画布节点剔除），扫描带 meta.cameraMoveAutoCapture 的
// scene3d 节点 → 离屏沿相机轨迹采 N 帧 → ffmpeg 拼成 mp4 → 落项目素材 → 写回 scene3d 节点
// meta.cameraMoveVideo（{ url, assetId, fps, targetNodeId }）+ 清标志。
//
// 与 StagingCaptureHost 同根因（自研画布剔除离屏节点 → 挂节点里的捕获永不触发，故抽成常驻 Host）。
// S2 范围 = 「scene3dState + 标志 → mp4 素材 url」，到此为止；把 mp4 喂进目标镜头
// referenceVideoUrls / 切 Seedance omni 是 S3，故这里只把结果写进 meta.cameraMoveVideo 留干净接缝。
import React from 'react'
import { useGenerationCanvasStore } from '../../store/generationCanvasStore'
import { normalizeScene3DState } from './scene3dSerializer'
import { persistCameraMoveVideo } from './cameraMoveVideo'
import { Scene3DTrajectoryCapture, type CameraMoveCaptureResult } from './Scene3DTrajectoryCapture'
import type { GenerationCanvasNode } from '../../model/generationCanvasTypes'
import { type CameraMove } from './cameraMoveVocab'
import { computeAttachCameraMove } from './attachCameraMoveToTarget'
import { toast } from '../../../../ui/toast'

type CameraMoveAutoCapture = {
  targetNodeId?: string
  frameCount?: number
  fps?: number
  move?: CameraMove
}

// S2 产物（写回 scene3d 节点 meta，供 S3 喂入消费）。
export type CameraMoveVideoResult = {
  url: string
  assetId?: string
  fps: number
  targetNodeId?: string
  createdAt: number
}

const DEFAULT_FPS = 24 // Seedance 参考视频要求 23.8–60 FPS（12fps 会被 InvalidParameter.FpsTooLow 拒）
const DEFAULT_FRAME_COUNT = 120 // 缺时长时的兜底：5s @ 24fps
const MIN_FRAME_COUNT = 2
const MAX_FRAME_COUNT = 240

function readCameraMove(node: GenerationCanvasNode): CameraMoveAutoCapture | null {
  const raw = node.meta?.cameraMoveAutoCapture
  return raw && typeof raw === 'object' ? (raw as CameraMoveAutoCapture) : null
}

function clampFrameCount(value: number | undefined, fallback: number): number {
  const n = Math.floor(value ?? fallback)
  if (!Number.isFinite(n)) return fallback
  return Math.min(MAX_FRAME_COUNT, Math.max(MIN_FRAME_COUNT, n))
}

/**
 * P3-C 没有显式 frameCount 时,从场景轨迹绑定时长 derive(frameCount = round(duration*fps)),
 * 而非用固定 48（48/12=4s 对不上 3/5/8s 的运镜）。无可读时长 → 回落 DEFAULT_FRAME_COUNT。
 */
function deriveFrameCountFromScene(scene3dState: unknown, fps: number): number {
  const state = scene3dState && typeof scene3dState === 'object' ? (scene3dState as Record<string, unknown>) : null
  const bindings = state && Array.isArray(state.trajectoryBindings) ? state.trajectoryBindings : []
  let maxDuration = 0
  for (const raw of bindings) {
    const b = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : null
    const end = b && typeof b.endTime === 'number' ? b.endTime : 0
    const start = b && typeof b.startTime === 'number' ? b.startTime : 0
    maxDuration = Math.max(maxDuration, end - start)
  }
  if (!(maxDuration > 0)) return DEFAULT_FRAME_COUNT
  return Math.round(maxDuration * fps)
}

function clampFps(value: number | undefined): number {
  const n = value ?? DEFAULT_FPS
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_FPS
  return Math.min(60, Math.max(24, n)) // 下限 24：Seedance 参考视频帧率必须 ≥23.8 FPS
}

/**
 * S3 喂入（薄壳）：读目标节点 → 交给纯核 computeAttachCameraMove 算 patch/跳过 → 写回 store + 弹提示。
 * 替换语义、幂等、种类校验、模式切换全在纯核里（attachCameraMoveToTarget.ts，可单测）。这里只负责
 * store I/O，不再内联任何附着逻辑（P1：AI 路与手动路共用同一核，无并行拷贝）。
 */
function attachCameraMoveToTarget(targetNodeId: string, mp4Url: string, move: CameraMove | undefined): void {
  const store = useGenerationCanvasStore.getState()
  const target = store.nodes.find((node) => node.id === targetNodeId)
  const outcome = computeAttachCameraMove(target, mp4Url, move)
  if (outcome.toast) toast(outcome.toast.message, outcome.toast.level)
  if (outcome.kind === 'patch') store.updateNode(targetNodeId, outcome.patch)
}

export function CameraMoveCaptureHost(): JSX.Element | null {
  // E2E 专用桥：仅当 renderer localStorage['__nomiE2E']==='1' 时把画布 store 挂到 window，
  // 供隔离走查在页面上下文里读写画布（如把相机轨迹改成假人走位再触发离屏渲染）。生产从不置该标志 → 永不暴露。
  React.useEffect(() => {
    try {
      if (typeof window !== 'undefined' && window.localStorage?.getItem('__nomiE2E') === '1') {
        ;(window as unknown as { __nomiCanvasStore?: unknown }).__nomiCanvasStore = useGenerationCanvasStore
      }
    } catch {
      // localStorage 不可用 → 跳过
    }
  }, [])
  const pendingNode = useGenerationCanvasStore((state) =>
    state.nodes.find((node) => node.kind === 'scene3d' && readCameraMove(node) !== null) ?? null,
  )
  const processingRef = React.useRef<string | null>(null)

  const handleResult = React.useCallback(
    async (nodeId: string, fps: number, capture: CameraMoveCaptureResult | null) => {
      const store = useGenerationCanvasStore.getState()
      const node = store.nodes.find((candidate) => candidate.id === nodeId)
      const config = node ? readCameraMove(node) : null
      const clearFlag = () => {
        const current = useGenerationCanvasStore.getState().nodes.find((candidate) => candidate.id === nodeId)
        if (!current) return
        const meta = { ...(current.meta || {}) }
        delete (meta as Record<string, unknown>).cameraMoveAutoCapture
        useGenerationCanvasStore.getState().updateNode(nodeId, { meta })
      }
      try {
        if (!node || !capture) return
        const persisted = await persistCameraMoveVideo(capture.frames, nodeId, capture.title, fps)
        if (!persisted.url) return
        const videoResult: CameraMoveVideoResult = {
          url: persisted.url,
          assetId: persisted.assetId,
          fps,
          targetNodeId: config?.targetNodeId,
          createdAt: Date.now(),
        }
        // S2 接缝：把运镜小片结果写回 scene3d 节点 meta（产物留痕，便于复用/调试）。
        const current = useGenerationCanvasStore.getState().nodes.find((candidate) => candidate.id === nodeId)
        store.updateNode(nodeId, {
          meta: {
            ...(current?.meta || node.meta || {}),
            cameraMoveVideo: videoResult,
          },
        })
        // S3 喂入：把 mp4 喂给目标镜头视频节点（有 video_ref 槽则切模式+填参考视频，否则降级 prompt 地板）。
        if (config?.targetNodeId) {
          attachCameraMoveToTarget(config.targetNodeId, persisted.url, config.move)
        }
      } finally {
        clearFlag()
        processingRef.current = null
      }
    },
    [],
  )

  if (!pendingNode) return null
  if (processingRef.current && processingRef.current !== pendingNode.id) return null
  processingRef.current = pendingNode.id
  const config = readCameraMove(pendingNode)
  const state = normalizeScene3DState(pendingNode.meta?.scene3dState)
  const nodeId = pendingNode.id
  const fps = clampFps(config?.fps)
  // P3-C 缺 frameCount 时按轨迹时长 derive(round(duration*fps)),别用固定 48。
  const frameCount = clampFrameCount(config?.frameCount, deriveFrameCountFromScene(state, fps))
  return (
    <Scene3DTrajectoryCapture
      state={state}
      frameCount={frameCount}
      fps={fps}
      title="运镜参考"
      onResult={(result) => { void handleResult(nodeId, fps, result) }}
    />
  )
}

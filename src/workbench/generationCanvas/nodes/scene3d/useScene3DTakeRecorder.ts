import React from 'react'
import { toast } from '../../../../ui/toast'
import {
  buildRecordedTakeScene,
  recordingDurationSeconds,
  type RecordedTake,
  type TakeSample,
} from './takeRecording'
import { MANNEQUIN_POSE_PRESETS } from './scene3dConstants'
import { clonePoseValue } from './scene3dMath'
import type { Scene3DPoseEvent } from './scene3dPoseTrack'
import type { Scene3DState, Scene3DVector3 } from './scene3dTypes'

// 录制期内部用：动作事件按 wall-clock(ms) 暂存，停止时再归一为「录制起点起算的秒」。
type RawPoseEvent = { ms: number; presetId?: string; pose?: Record<string, Scene3DVector3> }

// 录 take（S2）的临时态 hook。和 useScene3DCharacterDrive 同范本：只活在 Scene3DFullscreen 的 UI state，
// 不持久化进 Scene3DState。录制 = 在 possess 态上叠加：边操控边按时间戳采被操控角色世界位置 + 机位，
// 「停止」时把样本转成 trajectory（takeRecording 纯函数）→ 组出可被现有离屏捕获管线回放的 Scene3DState
// → 交给 onRecorded（由 Scene3DEditor 建 scene3d 节点 + 打 cameraMoveAutoCapture，复用 AI 运镜整条管线）。
//
// 采样由 <Scene3DTakeSampler>（Canvas 内 useFrame）调 sampleCharacter/sampleCamera 喂进来；本 hook 只
// 管 buffer + 状态机 + 停止时的纯转换，不碰 three（保持可单测的边界清晰，R9）。

const SAMPLE_INTERVAL_MS = 50 // 采样节流：20Hz，足够还原走位曲线，又不撑爆 buffer/离屏帧数

export type TakeRecorder = {
  isRecording: boolean
  elapsedSeconds: number
  /** 当前是否可录（possess 中且未在录） */
  canRecord: boolean
  startRecording: () => void
  stopRecording: () => void
  /** 采样接口（供 Canvas 内 sampler 调，自带节流，按 wall-clock 时间戳） */
  sampleCharacter: (position: Scene3DVector3) => void
  sampleCamera: (position: Scene3DVector3) => void
  /** 记录一次动作切换（录制中调；非录制 no-op）。time 由 hook 内部按 wall-clock 打戳。 */
  recordPoseEvent: (presetId: string) => void
  /**
   * #4：录制中「按 WASD 从静态动作恢复走路」时打一条 base 关键帧（presetId/pose 皆缺省 = rest），
   * 让离屏 step-hold 从 squat 切回 base → frameMotionSource 判回 locomotion（腿重新迈），不再蹲到片尾。
   * 非录制 no-op。
   */
  recordPoseResume: () => void
}

export function useScene3DTakeRecorder({
  possessId,
  readOnly,
  stateRef,
  onRecorded,
}: {
  possessId: string | null
  readOnly: boolean
  stateRef: React.MutableRefObject<Scene3DState>
  onRecorded: (recordedState: Scene3DState) => void
}): TakeRecorder {
  const [isRecording, setIsRecording] = React.useState(false)
  const [elapsedSeconds, setElapsedSeconds] = React.useState(0)

  const startMsRef = React.useRef(0)
  const characterSamplesRef = React.useRef<TakeSample[]>([])
  const cameraSamplesRef = React.useRef<TakeSample[]>([])
  const lastCharacterSampleMsRef = React.useRef(0)
  const lastCameraSampleMsRef = React.useRef(0)
  const poseEventsRef = React.useRef<RawPoseEvent[]>([])
  const tickRef = React.useRef<number | null>(null)

  const canRecord = !readOnly && Boolean(possessId) && !isRecording

  const clearTick = React.useCallback(() => {
    if (tickRef.current !== null) {
      window.clearInterval(tickRef.current)
      tickRef.current = null
    }
  }, [])

  const startRecording = React.useCallback(() => {
    if (readOnly || !possessId || isRecording) return
    characterSamplesRef.current = []
    cameraSamplesRef.current = []
    const now = performance.now()
    startMsRef.current = now
    lastCharacterSampleMsRef.current = 0
    lastCameraSampleMsRef.current = 0
    // 种一个 t=0 的起始姿势：applyActionPreset 会即时改 object.pose，停止时克隆到的是「最后那个姿势」，
    // 没有这个种子，回放第一段会落回末尾姿势而非录制起点姿势。读被操控角色当前 pose 当起点。
    const startPose = stateRef.current.objects.find((object) => object.id === possessId)?.pose
    poseEventsRef.current = [{ ms: now, presetId: undefined, pose: clonePoseValue(startPose) }]
    setElapsedSeconds(0)
    setIsRecording(true)
    clearTick()
    // 计时器只驱动 UI（REC 秒数）；样本时间戳走 performance.now()，与计时器无关（帧准不靠墙钟动画）。
    tickRef.current = window.setInterval(() => {
      setElapsedSeconds((performance.now() - startMsRef.current) / 1000)
    }, 100)
  }, [clearTick, isRecording, possessId, readOnly, stateRef])

  const sampleCharacter = React.useCallback((position: Scene3DVector3) => {
    if (!isRecording) return
    const now = performance.now()
    if (now - lastCharacterSampleMsRef.current < SAMPLE_INTERVAL_MS && characterSamplesRef.current.length > 0) return
    lastCharacterSampleMsRef.current = now
    characterSamplesRef.current.push({ time: now, position: [...position] as Scene3DVector3 })
  }, [isRecording])

  const sampleCamera = React.useCallback((position: Scene3DVector3) => {
    if (!isRecording) return
    const now = performance.now()
    if (now - lastCameraSampleMsRef.current < SAMPLE_INTERVAL_MS && cameraSamplesRef.current.length > 0) return
    lastCameraSampleMsRef.current = now
    cameraSamplesRef.current.push({ time: now, position: [...position] as Scene3DVector3 })
  }, [isRecording])

  const recordPoseEvent = React.useCallback((presetId: string) => {
    if (!isRecording) return
    const preset = MANNEQUIN_POSE_PRESETS.find((candidate) => candidate.id === presetId)
    if (!preset) return
    // pose 缺省（如「站立」）= rest 姿势；clonePoseValue(undefined) → undefined，由采样落回基准。
    poseEventsRef.current.push({ ms: performance.now(), presetId, pose: clonePoseValue(preset.pose) })
  }, [isRecording])

  const recordPoseResume = React.useCallback(() => {
    if (!isRecording) return
    // base 关键帧：presetId/pose 皆缺省（poseKeyframeKey → 'base'），step-hold 命中它即解除静态动作打断。
    poseEventsRef.current.push({ ms: performance.now(), presetId: undefined, pose: undefined })
  }, [isRecording])

  const stopRecording = React.useCallback(() => {
    if (!isRecording) return
    clearTick()
    setIsRecording(false)
    // 即时反馈（用户反馈 #11）：点停止后按钮瞬间变回「录 take」，用户以为白录。先即时确认「已停止」，
    // 出片是异步的，结果状态由画布上「录制走位参考」节点的徽标接力（生成中 → 已生成 ✓，见 Scene3DEditor）。
    toast('已停止录制，正在生成参考视频…', 'success')
    const endMs = performance.now()
    const objectId = possessId
    const characterSamples = characterSamplesRef.current
    const cameraSamples = cameraSamplesRef.current
    // 动作事件 wall-clock(ms) → 录制起点起算的秒（与 binding/播放头同时钟）。
    const startMs = startMsRef.current
    const poseEvents: Scene3DPoseEvent[] = poseEventsRef.current.map((event) => ({
      time: Math.max(0, (event.ms - startMs) / 1000),
      presetId: event.presetId,
      pose: event.pose,
    }))
    poseEventsRef.current = []
    setElapsedSeconds(0)
    if (!objectId) return
    const durationSeconds = recordingDurationSeconds(startMs, endMs)
    const take: RecordedTake = { possessedObjectId: objectId, characterSamples, cameraSamples, poseEvents, durationSeconds }
    const recordedState = buildRecordedTakeScene(stateRef.current, take)
    if (!recordedState) {
      toast('没录到走位（角色全程没移动），请操控角色走动后再录', 'warning')
      return
    }
    onRecorded(recordedState)
  }, [clearTick, isRecording, onRecorded, possessId, stateRef])

  // 退出操控 / 卸载时若还在录 → 静默收尾，不留悬挂计时器。
  React.useEffect(() => {
    if (!possessId && isRecording) {
      clearTick()
      setIsRecording(false)
      setElapsedSeconds(0)
    }
  }, [clearTick, isRecording, possessId])

  React.useEffect(() => () => clearTick(), [clearTick])

  return {
    isRecording,
    elapsedSeconds,
    canRecord,
    startRecording,
    stopRecording,
    sampleCharacter,
    sampleCamera,
    recordPoseEvent,
    recordPoseResume,
  }
}

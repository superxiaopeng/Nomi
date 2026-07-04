import { useGenerationCanvasStore } from '../../store/generationCanvasStore'
import { archetypeForNode, findVideoRefMode } from '../../agent/referenceEdgeCapability'
import { applyArchetypeModeSwitch, readArchetypeArray } from '../controls/archetypeMeta'
import { isVideoLikeGenerationNodeKind } from '../../model/generationNodeKinds'
import { toast } from '../../../../ui/toast'
import { CAMERA_MOVE_LABEL, CAMERA_MOVE_DESC, type CameraMove } from './cameraMoveVocab'

/** 运镜 prompt 地板（通用，全供应商可用）：人话点出该镜的运镜，作为不吃视频参考时的降级。 */
function cameraMoveDirective(move: CameraMove | undefined): string {
  if (!move) return ''
  return `\n镜头运动：${CAMERA_MOVE_LABEL[move]}（${CAMERA_MOVE_DESC[move]}）`
}

/**
 * S3 喂入：把运镜小片 mp4 喂给目标镜头视频节点。
 * - 目标模型有 video_ref 槽（如 Seedance 2.0 全能参考）→ 切到该模式 + meta.referenceVideoUrls 追加 mp4 +
 *   prompt 追加「参考视频运镜」指令（模型无关，引用视频，只迁运镜不迁内容）。
 * - 无 video_ref 槽 → 降级：只追加结构化运镜 prompt 地板（CAMERA_MOVE_LABEL/DESC），并标注跳过视频参考。
 *   （吃首尾帧的供应商的完整首尾帧降级是后续切片，这里先做 prompt 地板。）
 */
export function attachCameraMoveToTarget(targetNodeId: string, mp4Url: string, move: CameraMove | undefined): void {
  const store = useGenerationCanvasStore.getState()
  const target = store.nodes.find((node) => node.id === targetNodeId)
  if (!target) return
  // P2-A 校验目标节点种类:运镜参考只能喂视频生成节点。指到图片节点 → 没有 video_ref 槽,
  // 旧逻辑会静默把无用的运镜 prompt 追加到图片上(图片模型不懂"镜头运动")。诚实跳过并提示。
  if (!isVideoLikeGenerationNodeKind(target.kind)) {
    toast('运镜参考只能喂给视频镜头节点，已跳过（目标不是视频节点）', 'warning')
    return
  }
  const meta = { ...(target.meta || {}) } as Record<string, unknown>
  // P3-A 用 meta 标志判重附（不再靠 prompt 子串嗅探,基础 prompt 含 @Video1/「镜头运动：」会误判）。
  if (meta.cameraMoveAttached === true) return
  const archetype = archetypeForNode(target)
  const videoRef = findVideoRefMode(archetype)
  if (archetype && videoRef) {
    // P2-B 切模式前先看旧模式是否设了首/尾帧、而目标(video_ref)模式没有该槽 → 会在投影时被静默丢弃。
    // 留痕告诉用户「模式变了，首帧不再注入」，不静默改。
    const hadFirstOrLast =
      (typeof meta.firstFrameUrl === 'string' && meta.firstFrameUrl.trim().length > 0) ||
      (typeof meta.lastFrameUrl === 'string' && meta.lastFrameUrl.trim().length > 0)
    // 切到含 video_ref 的模式（已在该模式则 applyArchetypeModeSwitch 幂等）。
    let nextMeta = applyArchetypeModeSwitch(meta, archetype, videoRef.modeId)
    const existing = readArchetypeArray(nextMeta, videoRef.metaKey)
    const referenceVideoUrls = existing.includes(mp4Url) ? existing : [...existing, mp4Url]
    nextMeta = { ...nextMeta, [videoRef.metaKey]: referenceVideoUrls, cameraMoveAttached: true }
    const targetMode = archetype.modes.find((m) => m.id === videoRef.modeId)
    const targetHasFrameSlot = targetMode?.slots.some((s) => s.kind === 'first_frame' || s.kind === 'last_frame') ?? false
    if (hadFirstOrLast && !targetHasFrameSlot) {
      toast('已切换到全能参考模式以注入运镜参考视频（该模式无首/尾帧，原首帧不再生效）', 'warning')
    }
    const directive = `\n@Video1 跟随这段参考视频的运镜（只参考镜头运动，画面内容由角色参考与文字决定）。`
    const basePrompt = typeof target.prompt === 'string' ? target.prompt : ''
    const prompt = basePrompt.includes('@Video1') ? basePrompt : `${basePrompt}${directive}`
    store.updateNode(targetNodeId, { meta: nextMeta, prompt })
    return
  }
  // 降级：视频节点但模型无视频参考槽 → 只补结构化运镜 prompt 地板（保留模型不变）。
  const directive = cameraMoveDirective(move)
  if (!directive) return
  const basePrompt = typeof target.prompt === 'string' ? target.prompt : ''
  const prompt = basePrompt.includes('镜头运动：') ? basePrompt : `${basePrompt}${directive}`
  store.updateNode(targetNodeId, { meta: { ...meta, cameraMoveAttached: true }, prompt })
}

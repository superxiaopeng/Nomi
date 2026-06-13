import { z } from 'zod'
import type { GenerationCanvasEdgeMode } from '../model/generationCanvasTypes'

/**
 * 「分镜方案」中间表示（IR）—— 剧本→方案文档→确认→落画布 主链路的中枢。
 * 方案：`docs/plan/2026-06-13-storyboard-plan-document-flow.md`（§1.1 字段、决策 B=结构化字段视图）。
 *
 * planner 第一手产出这个**结构化对象**（不是自由文本），创作区把它渲染成可改的字段卡
 * （字段直接绑这个对象，改字段即改对象，无「文字→结构」解析），用户确认后
 * `storyboardPlanToCreateNodesArgs` 把它转成 create_canvas_nodes 参数落画布。
 */

/** 锚类型：跨镜头要一致的东西。character/scene/prop 默认视觉锚；style 默认文本锚（每镜常驻）。 */
export type PlanAnchorKind = 'character' | 'scene' | 'prop' | 'style'

/** 载体：视觉锚=生成参考图挂参考槽；文本锚=描述拼进引用它的镜头 prompt（prompt 能说清的就别生成图）。 */
export type PlanAnchorCarrier = 'visual' | 'text'

export type PlanAnchor = {
  /** 稳定 id；落画布时直接当 create_canvas_nodes 的 clientId。 */
  id: string
  kind: PlanAnchorKind
  /** 「林夏」「天台」「红书包」「全片风格」——镜头按名引用、也是卡片标题。 */
  name: string
  /** 标准描述：视觉锚 → 卡片/定妆 prompt；文本锚 → 拼进引用镜头的 prompt。 */
  description: string
  carrier: PlanAnchorCarrier
  /** all=每镜常驻（风格/品牌）；selective=被点名才用（角色/场景/道具）。缺省按 kind 推。 */
  scope?: 'all' | 'selective'
}

export type PlanShot = {
  index: number
  /** 该镜时长；落画布时钳到所选模型上限（在编辑器用选择器，天然不超）。 */
  durationSec: number
  /** 这镜用到哪些锚（按 anchor.id 引用）→ 视觉锚连参考边、文本锚拼 prompt。 */
  anchorIds: string[]
  /** 可直接生成的提示词（运镜+动作演进，不复述锚的静态描述）。 */
  prompt: string
}

export type StoryboardPlan = {
  title: string
  anchors: PlanAnchor[]
  shots: PlanShot[]
}

// ── 校验 schema：planner 产出/落库前的运行时守卫（也是 S3 激活时交给 LLM 的工具参数 schema）──
//
// 与上方手写类型同形：手写类型带字段级 JSDoc（语义文档，z.infer 会丢），故两者并存；
// 下方编译期守卫保证二者互相赋值兼容，防 schema 与类型漂移（P1 单一真相源的轻量落地）。

export const planAnchorSchema = z.object({
  id: z.string().min(1),
  kind: z.enum(['character', 'scene', 'prop', 'style']),
  name: z.string().min(1),
  description: z.string(),
  carrier: z.enum(['visual', 'text']),
  scope: z.enum(['all', 'selective']).optional(),
})

export const planShotSchema = z.object({
  index: z.number().int(),
  durationSec: z.number(),
  anchorIds: z.array(z.string()),
  prompt: z.string(),
})

export const storyboardPlanSchema = z.object({
  title: z.string(),
  anchors: z.array(planAnchorSchema),
  shots: z.array(planShotSchema),
})

// 编译期漂移守卫：仅当 zod 推断类型 ⟺ 手写类型互相可赋值时才编译通过（零运行时）。
const _planSchemaToType = (p: z.infer<typeof storyboardPlanSchema>): StoryboardPlan => p
const _planTypeToSchema = (p: StoryboardPlan): z.infer<typeof storyboardPlanSchema> => p
void _planSchemaToType
void _planTypeToSchema

/**
 * 落库前校验方案对象。planner 产出经 backend zod 已过一道，渲染层再守一道——
 * 防直接调用 / 未来别的入口绕过 backend 时灌入畸形对象（throw，调用方映射成 tool error）。
 */
export function parseStoryboardPlan(raw: unknown): StoryboardPlan {
  return storyboardPlanSchema.parse(raw)
}

// ── 落画布转换器：StoryboardPlan → create_canvas_nodes 参数（纯函数，可单测）──

/** create_canvas_nodes 节点参数（镜像 canvasTools.plannedNodeSchema 的渲染层用子集）。 */
export type PlanCreatedNode = {
  clientId: string
  kind: string
  title: string
  prompt: string
  modelKey?: string
  modeId?: string
  params?: Record<string, string | number | boolean>
}

export type PlanCreatedEdge = {
  sourceClientId: string
  targetClientId: string
  mode?: GenerationCanvasEdgeMode
}

export type PlanCreateNodesArgs = {
  summary: string
  nodes: PlanCreatedNode[]
  edges: PlanCreatedEdge[]
}

export type StoryboardPlanToArgsOptions = {
  /** 视频镜头默认模型（偏好 Seedance 2.0，通用解析）；调用方传入，不在此硬编码目录。 */
  defaultVideoModelKey?: string
  /** 默认模型的模式 id（选有 image_ref 槽的，参考才喂得进）；调用方传入。 */
  defaultVideoModeId?: string
  /** 镜头时长上限（所选默认模型支持的最大时长）；超过则钳到此值（落地不超模型上限）。 */
  maxDurationSec?: number
}

const VISUAL_KINDS: ReadonlySet<PlanAnchorKind> = new Set(['character', 'scene', 'prop'])

/** 锚类型 → 该锚连到镜头的参考边语义。 */
function edgeModeForAnchor(kind: PlanAnchorKind): GenerationCanvasEdgeMode {
  if (kind === 'character') return 'character_ref'
  if (kind === 'scene' || kind === 'style') return 'style_ref'
  return 'reference' // prop 走通用参考槽（无道具专用 mode）
}

/**
 * 锚类型 → 画布节点种类。角色/场景有专用卡；**道具无专用节点种类 → 用 image（通用参考图节点）**
 * ——直接用 'prop' 当 kind 会让画布 registry 查不到定义而崩（defaultSize undefined，R13 真机抓出）。
 * 道具落进哪个分类是 S4 的精修（补道具锚），这里先保证落得下、不崩。
 */
function anchorKindToNodeKind(kind: PlanAnchorKind): string {
  if (kind === 'character') return 'character'
  if (kind === 'scene') return 'scene'
  return 'image' // prop（style 是文本锚，不走到这）
}

function shotClientId(shot: PlanShot): string {
  return `shot-${shot.index}`
}

/** 文本锚的描述拼进引用它的镜头 prompt（「能 prompt 说清的就别生成图」的落地：文本锚 = 写进 prompt）。 */
function buildShotPrompt(shot: PlanShot, anchorById: Map<string, PlanAnchor>): string {
  const textBits = shot.anchorIds
    .map((id) => anchorById.get(id))
    .filter((anchor): anchor is PlanAnchor => Boolean(anchor) && anchor!.carrier === 'text')
    .map((anchor) => `${anchor.name}：${anchor.description}`.trim())
    .filter(Boolean)
  const base = shot.prompt.trim()
  return textBits.length ? [base, ...textBits].filter(Boolean).join('\n') : base
}

/**
 * 确认后：把方案转成 create_canvas_nodes 参数，照常走 applyCanvasToolCall 落画布
 * （复用现有建节点+连边+依赖波次「参考层先生成」，零重写）。
 * - 视觉锚（character/scene/prop）→ 卡片节点；文本锚（style 等）不建节点、描述拼进镜头 prompt。
 * - 每镜 → 视频节点（默认 Seedance 2.0、时长入 params）；引用的视觉锚 → 参考边。
 */
export function storyboardPlanToCreateNodesArgs(
  plan: StoryboardPlan,
  options: StoryboardPlanToArgsOptions = {},
): PlanCreateNodesArgs {
  const anchorById = new Map(plan.anchors.map((anchor) => [anchor.id, anchor]))
  const nodes: PlanCreatedNode[] = []
  const edges: PlanCreatedEdge[] = []

  // 视觉锚 → 卡片节点（clientId = anchor.id，落画布 registry 照常解析）。
  for (const anchor of plan.anchors) {
    if (anchor.carrier !== 'visual' || !VISUAL_KINDS.has(anchor.kind)) continue
    nodes.push({
      clientId: anchor.id,
      kind: anchorKindToNodeKind(anchor.kind),
      title: anchor.name,
      prompt: anchor.description.trim(),
    })
  }

  // 镜头 → 视频节点 + 引用的视觉锚连参考边。
  // 按 shot.index 排序后再建节点（审计 A5 防御）：布局按数组顺序排格子，若 LLM 把镜头
  // 乱序吐出来，画布空间顺序就会与镜头编号错位（镜6 排在镜5 前）。这里钉死「数组序=镜序」。
  const orderedShots = [...plan.shots].sort((a, b) => a.index - b.index)
  for (const shot of orderedShots) {
    const id = shotClientId(shot)
    // 时长钳到所选模型上限（S4「时长不超模型上限」铁律的落地点；无上限信息则原样）。
    const duration =
      options.maxDurationSec && options.maxDurationSec > 0
        ? Math.min(shot.durationSec, options.maxDurationSec)
        : shot.durationSec
    nodes.push({
      clientId: id,
      kind: 'video',
      title: `镜头 ${shot.index}`,
      prompt: buildShotPrompt(shot, anchorById),
      ...(options.defaultVideoModelKey ? { modelKey: options.defaultVideoModelKey } : {}),
      ...(options.defaultVideoModeId ? { modeId: options.defaultVideoModeId } : {}),
      ...(duration > 0 ? { params: { duration } } : {}),
    })
    for (const anchorId of shot.anchorIds) {
      const anchor = anchorById.get(anchorId)
      if (!anchor || anchor.carrier !== 'visual' || !VISUAL_KINDS.has(anchor.kind)) continue
      edges.push({ sourceClientId: anchorId, targetClientId: id, mode: edgeModeForAnchor(anchor.kind) })
    }
  }

  return { summary: plan.title.trim() || '分镜方案', nodes, edges }
}

import { tool } from "ai";
import { z } from "zod";

/**
 * Zod schemas for the generation canvas tools the LLM is allowed to call.
 *
 * The schemas mirror the existing `GenerationCanvasNode` shape (see
 * `src/workbench/generationCanvas/model/...`). They intentionally use a
 * `clientId` (LLM-supplied) instead of the real node id so the model can
 * reference nodes it just proposed before the user has confirmed creation.
 *
 * The Vercel AI SDK `tool({ ... })` helper only requires `description` +
 * `parameters` for the LLM-side schema. We deliberately omit `execute` here:
 * actual mutation happens in the renderer once the user confirms, so the main
 * process emits the tool-call to the UI and feeds the user's decision back to
 * the model as the tool result.
 */

export const canvasNodeKindSchema = z.enum([
  "text",
  "character",
  "scene",
  "image",
  "keyframe",
  "video",
  "shot",
  "output",
  "panorama",
]);

export const plannedNodeSchema = z.object({
  clientId: z.string().min(1),
  kind: canvasNodeKindSchema,
  title: z.string().min(1),
  prompt: z.string(),
  // 可省略：批量布局由渲染层 derive 成紧凑网格（applyCanvasToolCall.gridPosition），
  // 不再信任 LLM 手写的像素坐标（硬编码单行会溢出视口）。
  position: z
    .object({
      x: z.number(),
      y: z.number(),
    })
    .optional(),
  // bug①：agent 为节点建议模型 + 模式 + 标量参数（比例/清晰度…），用户在计划卡可改可确认。
  // modelKey/modeId 必须取自系统提示词给出的「可用模型清单」；params 是宽松键值（schema 不按
  // 单个模型严格——一次 batch 可含多模型），合法性在写入时按档案逐字段校验（单字段，跨字段留二期）。
  modelKey: z.string().optional(),
  modeId: z.string().optional(),
  params: z.record(z.union([z.string(), z.number(), z.boolean()])).optional(),
});

export const plannedEdgeSchema = z.object({
  sourceClientId: z.string().min(1),
  targetClientId: z.string().min(1),
  // T1 轨迹语义：边的参考槽语义。character_ref=角色定妆参考、style_ref=场景/风格参考、
  // composition_ref=构图参考、first_frame=源图像作为目标视频首帧（源为视频节点时＝
  // 用源视频尾帧接力，须用户在计划卡单独勾选）、last_frame=尾帧约束、reference=通用参考。
  mode: z
    .enum(["reference", "first_frame", "last_frame", "style_ref", "character_ref", "composition_ref"])
    .optional()
    .describe(
      "Reference-slot semantics: character_ref (cast sheet feeds keyframe), style_ref (scene/style feeds keyframe), composition_ref, first_frame (keyframe image feeds the video's first frame; when the source is a VIDEO node this means last-frame relay and must be opted-in by the user), last_frame, reference (generic). Omit for a generic reference edge.",
    ),
});

export const canvasToolNames = [
  "read_canvas_state",
  "create_canvas_nodes",
  "connect_canvas_edges",
  "set_node_prompt",
  "delete_canvas_nodes",
  "run_generation_batch",
] as const;
export type CanvasToolName = (typeof canvasToolNames)[number];

export const canvasTools = {
  read_canvas_state: tool({
    description:
      "Read the current generation canvas: returns all nodes (id, kind, title, prompt, position) and all edges (source, target). Use this first when you need to know what is already on the canvas before planning new work.",
    parameters: z.object({}),
  }),
  create_canvas_nodes: tool({
    description:
      "Propose a batch of new canvas nodes AND the reference edges between them, in this ONE call. Nodes are NOT auto-executed; they appear on the canvas as idle/draft and the user manually clicks generate. Always include the plan's edges via the `edges` field — never split them into a separate connect_canvas_edges call (the user approves the whole plan once).",
    parameters: z.object({
      summary: z
        .string()
        .describe("One-sentence summary of the plan, shown to the user before confirmation."),
      nodes: z.array(plannedNodeSchema).min(1).max(24),
      edges: z
        .array(plannedEdgeSchema)
        .max(48)
        .optional()
        .describe(
          "Reference edges between this plan's nodes (use their clientId) and/or existing real node ids. Submit together with nodes in this same call.",
        ),
    }),
  }),
  connect_canvas_edges: tool({
    description:
      "Connect EXISTING canvas nodes with reference edges (source feeds context into target). Only for follow-up edits to nodes already on the canvas — when proposing new nodes, put their edges in create_canvas_nodes instead.",
    parameters: z.object({
      edges: z.array(plannedEdgeSchema).min(1).max(48),
    }),
  }),
  set_node_prompt: tool({
    description:
      "Rewrite the prompt of a single existing node. Use this in refine/polish flows. Do not use to create new nodes.",
    parameters: z.object({
      nodeId: z.string().min(1),
      prompt: z.string().min(1),
    }),
  }),
  delete_canvas_nodes: tool({
    description:
      "Delete one or more existing canvas nodes by id. Always destructive — the user must confirm.",
    parameters: z.object({
      nodeIds: z.array(z.string().min(1)).min(1).max(24),
    }),
  }),
  // S6b 受理语义:确认前零网络调用零扣费;批准 = 受理并启动,返回受理回执,
  // 生成进度走画布 run 域事件给用户看,不回喂 LLM(长生成不阻塞对话回合)。
  run_generation_batch: tool({
    description:
      "Start real generation for a batch of existing canvas nodes (costs credits — the user must confirm). Provide real node ids from read_canvas_state, or clientIds from this turn's create_canvas_nodes. Nodes are scheduled in dependency waves (references generate first). Returns an acceptance receipt; generation progress is shown to the user on the canvas, not returned to you.",
    parameters: z.object({
      nodeIds: z.array(z.string().min(1)).min(1).max(24),
    }),
  }),
} as const;

export type CanvasTools = typeof canvasTools;

export type PlannedNode = z.infer<typeof plannedNodeSchema>;
export type PlannedEdge = z.infer<typeof plannedEdgeSchema>;

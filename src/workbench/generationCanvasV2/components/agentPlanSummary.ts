export type PendingToolCallLike = {
  toolCallId: string
  toolName: string
  args: unknown
}

export type PlannedNode = {
  clientId: string
  kind: string
  title: string
  prompt: string
  position?: { x: number; y: number }
  // bug①：agent 建议的模型 + 模式 + 标量参数（计划卡 chip 展示 + 用户可改 + 确认后写入节点 meta）。
  modelKey?: string
  modeId?: string
  params?: Record<string, string | number | boolean>
}

/** 只保留标量值（string/number/boolean），丢弃 agent 可能塞进来的对象/数组等非法参数值。 */
function sanitizeAgentParams(raw: Record<string, unknown>): Record<string, string | number | boolean> {
  const out: Record<string, string | number | boolean> = {}
  for (const [key, value] of Object.entries(raw)) {
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      out[key] = value
    }
  }
  return out
}

export type PlannedEdge = {
  sourceClientId: string
  targetClientId: string
}

export type AgentPlanSummary = {
  summary: string
  nodes: PlannedNode[]
  edges: PlannedEdge[]
  createCallId: string
  connectCallId: string | null
}

/**
 * Pure helper extracted from AgentPlanCard so it can be unit-tested
 * without pulling in React. Detects a `create_canvas_nodes` call
 * optionally paired with `connect_canvas_edges` and folds them into a
 * single summary the storyboard plan card can render.
 */
export function summarizeAgentPlan(calls: readonly PendingToolCallLike[]): AgentPlanSummary | null {
  const createCall = calls.find((call) => call.toolName === 'create_canvas_nodes')
  if (!createCall) return null
  const createArgs = (createCall.args && typeof createCall.args === 'object')
    ? createCall.args as Record<string, unknown>
    : {}
  const rawNodes = Array.isArray(createArgs.nodes) ? createArgs.nodes : []
  if (rawNodes.length === 0) return null
  const nodes: PlannedNode[] = rawNodes.map((raw, index) => {
    const node = (raw && typeof raw === 'object') ? raw as Record<string, unknown> : {}
    const position = (node.position && typeof node.position === 'object') ? node.position as Record<string, unknown> : null
    return {
      clientId: typeof node.clientId === 'string' && node.clientId.trim()
        ? node.clientId
        : `n${index + 1}`,
      kind: typeof node.kind === 'string' ? node.kind : 'image',
      title: typeof node.title === 'string' ? node.title : `镜头 ${index + 1}`,
      prompt: typeof node.prompt === 'string' ? node.prompt : '',
      ...(position && typeof position.x === 'number' && typeof position.y === 'number'
        ? { position: { x: position.x, y: position.y } }
        : {}),
      ...(typeof node.modelKey === 'string' && node.modelKey.trim() ? { modelKey: node.modelKey.trim() } : {}),
      ...(typeof node.modeId === 'string' && node.modeId.trim() ? { modeId: node.modeId.trim() } : {}),
      ...(node.params && typeof node.params === 'object' && !Array.isArray(node.params)
        ? { params: sanitizeAgentParams(node.params as Record<string, unknown>) }
        : {}),
    }
  })

  const connectCall = calls.find((call) => call.toolName === 'connect_canvas_edges')
  let edges: PlannedEdge[] = []
  if (connectCall) {
    const connectArgs = (connectCall.args && typeof connectCall.args === 'object')
      ? connectCall.args as Record<string, unknown>
      : {}
    const rawEdges = Array.isArray(connectArgs.edges) ? connectArgs.edges : []
    edges = rawEdges
      .map((raw) => (raw && typeof raw === 'object') ? raw as Record<string, unknown> : {})
      .map((edge) => ({
        sourceClientId: String(edge.sourceClientId || edge.source || '').trim(),
        targetClientId: String(edge.targetClientId || edge.target || '').trim(),
      }))
      .filter((edge) => edge.sourceClientId && edge.targetClientId)
  }

  const summary = typeof createArgs.summary === 'string' && createArgs.summary.trim()
    ? createArgs.summary.trim()
    : `${nodes.length} 个镜头 + ${edges.length} 条引用边`

  return {
    summary,
    nodes,
    edges,
    createCallId: createCall.toolCallId,
    connectCallId: connectCall?.toolCallId ?? null,
  }
}

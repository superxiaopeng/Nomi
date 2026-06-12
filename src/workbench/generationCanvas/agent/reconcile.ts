// 对账(harness S6-3,N12 的命门)——「执行的」与「批准的」逐字段比对的纯函数。
// 输入全部显式传入(proposal 的 effectiveArgs + 执行结果 + 画布后态),同入参恒同结果,
// property test「任意批准重放→reconciliation 必 ok」可锁 CI。
// 派生字段白名单(显式声明,§6.3):position(批量网格由渲染层有意 derive,忽略 LLM 像素坐标)/
// categoryId(按 kind 归类,schema 不收 LLM 值)/title 兜底(空标题补「镜头 N」)。
// 白名单外的任何出入都如实报——尤其 modelKey/params 被校验丢弃(plannedNodeMeta 对不可用
// 模型/非法参数回退默认):用户在计划卡上看到并批准了那些 chip,执行悄悄换掉=必须可见。

export type ReconcileDeviation = {
  /** 人话定位:哪个节点/哪条边。 */
  where: string
  field: string
  expected: unknown
  actual: unknown
}

export type ReconcileResult = {
  ok: boolean
  deviations: ReconcileDeviation[]
}

export type ReconcileStepInput = {
  toolName: string
  effectiveArgs: Record<string, unknown>
  result: unknown
}

type NodeLike = {
  id: string
  kind: string
  title: string
  prompt?: string
  meta?: Record<string, unknown>
}

type EdgeLike = { source: string; target: string }

const asRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' ? (value as Record<string, unknown>) : {}

export function reconcileProposal(input: {
  steps: ReconcileStepInput[]
  clientIdToNodeId: Record<string, string>
  nodes: readonly NodeLike[]
  edges: readonly EdgeLike[]
  /**
   * clientId 跨提议解析回退（注入保持纯函数）：connect/set_prompt/delete 若在独立提议里
   * 引用前序提议的 clientId，本批 clientIdToNodeId 查不到 → 必须回退到执行侧同一个全局
   * registry（applyCanvasToolCall.resolveCanvasToolNodeId），否则对账拿计划 id 找不到
   * 真实边/节点，必然误报「执行与批准有出入」（2026-06-12 真机走查 bug A）。
   */
  resolveExternalId?: (raw: string) => string
}): ReconcileResult {
  const deviations: ReconcileDeviation[] = []
  const nodeById = new Map(input.nodes.map((node) => [node.id, node]))
  const resolveId = (raw: string): string =>
    input.clientIdToNodeId[raw] ?? input.resolveExternalId?.(raw) ?? raw

  const reconcileEdges = (planned: unknown[]): void => {
    for (const raw of planned) {
      const edge = asRecord(raw)
      const source = resolveId(String(edge.sourceClientId || edge.source || '').trim())
      const target = resolveId(String(edge.targetClientId || edge.target || '').trim())
      if (!source || !target) continue
      const exists = input.edges.some((candidate) => candidate.source === source && candidate.target === target)
      if (!exists) {
        deviations.push({ where: `${source} → ${target}`, field: '引用边', expected: '已连接', actual: '未连接' })
      }
    }
  }

  for (const step of input.steps) {
    if (step.toolName === 'create_canvas_nodes') {
      const planned = Array.isArray(step.effectiveArgs.nodes) ? step.effectiveArgs.nodes : []
      planned.forEach((raw, index) => {
        const plan = asRecord(raw)
        const clientId = typeof plan.clientId === 'string' && plan.clientId ? plan.clientId : `#${index + 1}`
        const where = typeof plan.title === 'string' && plan.title.trim() ? plan.title.trim() : clientId
        const realId = input.clientIdToNodeId[clientId]
        const node = realId ? nodeById.get(realId) : undefined
        if (!node) {
          deviations.push({ where, field: '节点', expected: '已创建', actual: '不存在' })
          return
        }
        if (typeof plan.kind === 'string' && plan.kind !== node.kind) {
          deviations.push({ where, field: '类型', expected: plan.kind, actual: node.kind })
        }
        if (typeof plan.prompt === 'string' && plan.prompt !== (node.prompt ?? '')) {
          deviations.push({ where, field: '提示词', expected: plan.prompt, actual: node.prompt ?? '' })
        }
        // title:批准了非空标题必须原样落地;空标题的「镜头 N」兜底在白名单内。
        if (typeof plan.title === 'string' && plan.title.trim() && plan.title.trim() !== node.title) {
          deviations.push({ where, field: '标题', expected: plan.title.trim(), actual: node.title })
        }
        // 计划卡上用户过目的模型/参数 chip:执行被校验丢弃/替换 → 如实报(不在白名单)。
        const meta = asRecord(node.meta)
        if (typeof plan.modelKey === 'string' && plan.modelKey.trim() && meta.modelKey !== plan.modelKey.trim()) {
          deviations.push({ where, field: '模型', expected: plan.modelKey.trim(), actual: meta.modelKey ?? '(回退自动选)' })
        }
        const plannedParams = asRecord(plan.params)
        for (const [key, value] of Object.entries(plannedParams)) {
          if (typeof value !== 'string' && typeof value !== 'number' && typeof value !== 'boolean') continue
          // 只在模型 meta 真写入的前提下比参数(模型整体回退时上面已报,参数不再逐个刷屏)。
          if (typeof plan.modelKey === 'string' && meta.modelKey === plan.modelKey.trim() && meta[key] !== value) {
            deviations.push({ where, field: `参数 ${key}`, expected: value, actual: meta[key] ?? '(默认值)' })
          }
        }
      })
      // 同计划携带的边（节点+边一次批准）：与节点同步对账。
      reconcileEdges(Array.isArray(step.effectiveArgs.edges) ? step.effectiveArgs.edges : [])
      continue
    }

    if (step.toolName === 'connect_canvas_edges') {
      reconcileEdges(Array.isArray(step.effectiveArgs.edges) ? step.effectiveArgs.edges : [])
      continue
    }

    if (step.toolName === 'set_node_prompt') {
      const nodeId = resolveId(String(step.effectiveArgs.nodeId || '').trim())
      const prompt = typeof step.effectiveArgs.prompt === 'string' ? step.effectiveArgs.prompt : ''
      const node = nodeById.get(nodeId)
      if (!node) deviations.push({ where: nodeId, field: '节点', expected: '存在', actual: '不存在' })
      else if ((node.prompt ?? '') !== prompt) {
        deviations.push({ where: node.title || nodeId, field: '提示词', expected: prompt, actual: node.prompt ?? '' })
      }
      continue
    }

    if (step.toolName === 'delete_canvas_nodes') {
      const nodeIds = Array.isArray(step.effectiveArgs.nodeIds) ? step.effectiveArgs.nodeIds : []
      for (const raw of nodeIds) {
        const nodeId = resolveId(String(raw || '').trim())
        if (nodeId && nodeById.has(nodeId)) {
          deviations.push({ where: nodeId, field: '节点', expected: '已删除', actual: '仍存在' })
        }
      }
      continue
    }
  }

  return { ok: deviations.length === 0, deviations }
}

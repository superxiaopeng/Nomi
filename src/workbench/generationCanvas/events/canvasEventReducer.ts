// 画布事件重放器(harness S5-a):事件 → 投影的纯函数。
// 这就是"账本算余额"的那只手——S5-a 当 CI 安全网(replay≡snapshot 属性测试),
// S5-b 翻正后当 hydrate/undo 的正式投影。复用 graphOps 纯算子保证与 store 同语义。
// 未知事件类型原样跳过(前向兼容:老版本重放新日志不崩,§4.1 演进策略)。
import { removeNodes, upsertNode } from '../model/graphOps'
import type { GenerationCanvasEdge, GenerationCanvasNode, NodeGroup } from '../model/generationCanvasTypes'

export type CanvasProjection = {
  nodes: GenerationCanvasNode[]
  edges: GenerationCanvasEdge[]
  groups: NodeGroup[]
}

export const emptyCanvasProjection = (): CanvasProjection => ({ nodes: [], edges: [], groups: [] })

type ReplayableEvent = { type: string; payload: Record<string, unknown> }

export function applyCanvasEvent(projection: CanvasProjection, event: ReplayableEvent): CanvasProjection {
  const payload = event.payload || {}
  switch (event.type) {
    case 'canvas.node.added': {
      const node = payload.node as GenerationCanvasNode | undefined
      if (!node?.id) return projection
      return { ...projection, nodes: upsertNode(projection.nodes, node) }
    }
    case 'canvas.node.moved': {
      const nodeId = String(payload.nodeId || '')
      const position = payload.position as { x: number; y: number } | undefined
      if (!nodeId || !position) return projection
      return {
        ...projection,
        nodes: projection.nodes.map((node) => (node.id === nodeId ? { ...node, position } : node)),
      }
    }
    case 'canvas.node.prompt-changed': {
      const nodeId = String(payload.nodeId || '')
      if (!nodeId) return projection
      return {
        ...projection,
        nodes: projection.nodes.map((node) => (node.id === nodeId ? { ...node, prompt: String(payload.prompt ?? '') } : node)),
      }
    }
    case 'canvas.node.removed': {
      const nodeId = String(payload.nodeId || '')
      if (!nodeId) return projection
      const next = removeNodes(projection.nodes, projection.edges, [nodeId])
      return {
        nodes: next.nodes,
        edges: next.edges,
        groups: projection.groups.map((group) => ({
          ...group,
          nodeIds: group.nodeIds.filter((candidate) => candidate !== nodeId),
        })),
      }
    }
    default:
      return projection
  }
}

export function replayCanvasEvents(events: readonly ReplayableEvent[]): CanvasProjection {
  return events.reduce(applyCanvasEvent, emptyCanvasProjection())
}

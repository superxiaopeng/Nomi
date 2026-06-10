import type { GenerationCanvasEdge, GenerationCanvasEdgeMode, GenerationCanvasNode, GenerationNodeKind } from './generationCanvasTypes'
import {
  getGenerationNodeDefaultSize,
  getGenerationNodeDefaultTitle,
} from './generationNodeKinds'

export { DEFAULT_NODE_SIZE, NODE_KIND_LABEL } from './generationNodeKinds'

export const EDGE_MODE_LABEL: Record<GenerationCanvasEdgeMode, string> = {
  reference: '素材参考',
  first_frame: '首帧',
  last_frame: '尾帧',
  style_ref: '风格',
  character_ref: '角色',
  composition_ref: '构图',
}

export const EDGE_MODE_ORDER: GenerationCanvasEdgeMode[] = [
  'reference',
  'first_frame',
  'last_frame',
  'style_ref',
  'character_ref',
  'composition_ref',
]

export function createGenerationNode(input: {
  id: string
  kind: GenerationNodeKind
  title?: string
  x?: number
  y?: number
  prompt?: string
}): GenerationCanvasNode {
  const size = getGenerationNodeDefaultSize(input.kind)
  return {
    id: input.id,
    kind: input.kind,
    title: input.title || getGenerationNodeDefaultTitle(input.kind),
    position: { x: input.x ?? 120, y: input.y ?? 120 },
    size,
    prompt: input.prompt || '',
    references: [],
    history: [],
    status: 'idle',
    meta: {},
  }
}

export function upsertNode(nodes: GenerationCanvasNode[], nextNode: GenerationCanvasNode): GenerationCanvasNode[] {
  const index = nodes.findIndex((node) => node.id === nextNode.id)
  if (index < 0) return [...nodes, nextNode]
  return nodes.map((node) => (node.id === nextNode.id ? { ...node, ...nextNode } : node))
}

export function patchNode(
  nodes: GenerationCanvasNode[],
  nodeId: string,
  patch: Partial<GenerationCanvasNode>,
): GenerationCanvasNode[] {
  return nodes.map((node) => (node.id === nodeId ? { ...node, ...patch } : node))
}

export function removeNodes(
  nodes: GenerationCanvasNode[],
  edges: GenerationCanvasEdge[],
  nodeIds: string[],
): { nodes: GenerationCanvasNode[]; edges: GenerationCanvasEdge[] } {
  const idSet = new Set(nodeIds)
  return {
    nodes: nodes.filter((node) => !idSet.has(node.id)),
    edges: edges.filter((edge) => !idSet.has(edge.source) && !idSet.has(edge.target)),
  }
}

export function createEdgeId(source: string, target: string): string {
  return `edge-${source}-${target}`
}

export function connectNodes(
  edges: GenerationCanvasEdge[],
  source: string,
  target: string,
  mode: GenerationCanvasEdgeMode = 'reference',
): GenerationCanvasEdge[] {
  if (!source || !target || source === target) return edges
  if (edges.some((edge) => edge.source === source && edge.target === target)) return edges
  return [...edges, { id: createEdgeId(source, target), source, target, mode }]
}

export function disconnectEdge(edges: GenerationCanvasEdge[], edgeId: string): GenerationCanvasEdge[] {
  return edges.filter((edge) => edge.id !== edgeId)
}

export function rollbackNodeHistory(nodes: GenerationCanvasNode[], nodeId: string, resultId: string): GenerationCanvasNode[] {
  return nodes.map((node) => {
    if (node.id !== nodeId) return node
    const result = (node.history || []).find((entry) => entry.id === resultId)
    if (!result) return node
    return { ...node, result, status: 'success', error: undefined }
  })
}

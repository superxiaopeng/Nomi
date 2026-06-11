// S5-a 安全网:随机操作序列下 replay(events) ≡ store snapshot(总方案 §1.2 不变量)。
// 这是 S5-b 翻正(日志当唯一真相源)的前置数学证明——影子期它在 CI 锁死
// "store 直接变更"与"事件重放"两条路永远算出同一个画布。
// 覆盖随接线扩展:目前 4 个已接 action(addNode/moveNode/updateNodePrompt/deleteNode)。
import fc from 'fast-check'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { useGenerationCanvasStore, __resetGenerationCanvasHistoryForTests } from '../store/generationCanvasStore'
import { setCanvasEventSinkForTests, type CanvasShadowEvent } from './canvasEventEmitter'
import { replayCanvasEvents } from './canvasEventReducer'

type Op =
  | { kind: 'add'; title: string; prompt: string; nodeKind: 'image' | 'video' | 'text' }
  | { kind: 'move'; pick: number; x: number; y: number }
  | { kind: 'prompt'; pick: number; text: string }
  | { kind: 'remove'; pick: number }

const opArbitrary: fc.Arbitrary<Op> = fc.oneof(
  fc.record({
    kind: fc.constant<'add'>('add'),
    title: fc.string({ maxLength: 24 }),
    prompt: fc.string({ maxLength: 120 }),
    nodeKind: fc.constantFrom<'image' | 'video' | 'text'>('image', 'video', 'text'),
  }),
  fc.record({ kind: fc.constant<'move'>('move'), pick: fc.nat(99), x: fc.integer({ min: -2000, max: 4000 }), y: fc.integer({ min: -2000, max: 4000 }) }),
  fc.record({ kind: fc.constant<'prompt'>('prompt'), pick: fc.nat(99), text: fc.string({ maxLength: 120 }) }),
  fc.record({ kind: fc.constant<'remove'>('remove'), pick: fc.nat(99) }),
)

function applyOp(op: Op): void {
  const store = useGenerationCanvasStore.getState()
  const nodes = store.nodes
  if (op.kind === 'add') {
    store.addNode({ kind: op.nodeKind, title: op.title || 'n', prompt: op.prompt })
    return
  }
  if (nodes.length === 0) return
  const target = nodes[op.pick % nodes.length]
  if (op.kind === 'move') store.moveNode(target.id, { x: op.x, y: op.y })
  else if (op.kind === 'prompt') store.updateNodePrompt(target.id, op.text)
  else store.deleteNode(target.id)
}

describe('S5-a replay ≡ snapshot(属性测试,CI 安全网)', () => {
  let captured: CanvasShadowEvent[] = []

  beforeEach(() => {
    captured = []
    setCanvasEventSinkForTests((events) => captured.push(...events))
  })
  afterEach(() => {
    setCanvasEventSinkForTests(null)
  })

  it('任意操作序列下,事件重放与 store 投影逐字节一致', () => {
    fc.assert(
      fc.property(fc.array(opArbitrary, { maxLength: 40 }), (ops) => {
        captured = []
        __resetGenerationCanvasHistoryForTests()
        useGenerationCanvasStore.getState().restoreSnapshot({ nodes: [], edges: [], groups: [] })
        for (const op of ops) applyOp(op)
        const state = useGenerationCanvasStore.getState()
        const projection = { nodes: state.nodes, edges: state.edges, groups: state.groups }
        const replayed = replayCanvasEvents(captured)
        expect(JSON.parse(JSON.stringify(replayed))).toEqual(JSON.parse(JSON.stringify(projection)))
      }),
      { numRuns: 60 },
    )
  })
})

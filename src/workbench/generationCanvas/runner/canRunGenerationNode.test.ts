import { describe, it, expect } from 'vitest'
import { canRunGenerationNode } from './generationRunController'
import { MODEL_ARCHETYPES } from '../../../config/modelArchetypes'
import type { GenerationCanvasNode } from '../model/generationCanvasTypes'

// 回归：Seedance omni 视频节点放了参考数组就该「可生成」。修复前 canRunGenerationNode 只看
// 首/尾帧 + referenceImages，看不到 referenceImageUrls → omni 节点 ↑ 按钮被锁死、误提示「需要首帧」。

function videoNode(modeId: string, meta: Record<string, unknown> = {}): GenerationCanvasNode {
  return {
    id: 'v1', kind: 'video', title: 'v', position: { x: 0, y: 0 }, prompt: '',
    meta: { modelKey: 'seedance-2', archetype: { id: 'seedance-2', modeId }, ...meta },
  } as GenerationCanvasNode
}

describe('canRunGenerationNode — 视频节点参考判定', () => {
  it('omni 无任何参考 → 不可生成', () => {
    expect(canRunGenerationNode(videoNode('omni'), { nodes: [], edges: [] })).toBe(false)
  })
  it('omni 放了角色图数组 → 可生成（修复点）', () => {
    const node = videoNode('omni', { referenceImageUrls: ['https://cdn/c1.png'] })
    expect(canRunGenerationNode(node, { nodes: [node], edges: [] })).toBe(true)
  })
  it('omni 放了参考视频（nomi-local，传输前本地化）→ 可生成', () => {
    const node = videoNode('omni', { referenceVideoUrls: ['nomi-local://asset/p/v.mp4'] })
    expect(canRunGenerationNode(node, { nodes: [node], edges: [] })).toBe(true)
  })
  it('首帧模式：有 firstFrameUrl → 可生成；空 → 不可', () => {
    expect(canRunGenerationNode(videoNode('first', { firstFrameUrl: 'https://cdn/f.png' }), { nodes: [], edges: [] })).toBe(true)
    expect(canRunGenerationNode(videoNode('first'), { nodes: [], edges: [] })).toBe(false)
  })
  it('image / text 节点始终可生成（prompt 缺失由下游兜底）', () => {
    expect(canRunGenerationNode({ kind: 'image' } as GenerationCanvasNode)).toBe(true)
    expect(canRunGenerationNode({ kind: 'text' } as GenerationCanvasNode)).toBe(true)
  })
  it('文生视频（t2v，模式无参考槽）无参考也可生成（修复：原 video 一律要首帧→锁死 t2v 按钮）', () => {
    // apimart Seedance t2v 模式 slots:[] → prompt-only 即可生成
    const node = {
      id: 'v1', kind: 'video', title: 'v', position: { x: 0, y: 0 }, prompt: '一只猫跳下沙发',
      meta: { modelKey: 'doubao-seedance-2.0', archetype: { id: 'seedance-2-apimart', modeId: 't2v' } },
    } as GenerationCanvasNode
    expect(canRunGenerationNode(node, { nodes: [node], edges: [] })).toBe(true)
  })
  it('RunningHub Seedance 默认 text 模式（slots:[]）无参考可生成（用户反馈：C-Dance 按钮点不了）', () => {
    const node = {
      id: 'v1', kind: 'video', title: 'v', position: { x: 0, y: 0 }, prompt: '一只猫跳下沙发',
      meta: { modelKey: 'bytedance/seedance-2.0-global', archetype: { id: 'runninghub-seedance', modeId: 'text' } },
    } as GenerationCanvasNode
    expect(canRunGenerationNode(node, { nodes: [node], edges: [] })).toBe(true)
  })
})

// 结构保证（不变量）：把「t2v 按钮被锁死」从「修了这一处」升级成「整类不再复发」。
// 规则：video 节点的「可生成（空参考时）」必须 ⟺「当前模式无参考槽（slots:[]）」——
//   无参考槽 = 纯文生视频 = prompt-only 可生成；有参考槽 = 需先放参考。
// 走遍**所有** video 档案 × 所有模式，任何新档案/新模式若让 gate 与槽声明不一致（如给 t2v 模式留了
// 多余槽 → 误锁按钮；或给 i2v 模式漏了槽 → 空跑必失败），这里立刻红，不必等用户撞到灰按钮。
// 注：故意按 slots 判定而非 transportTaskKind——HappyHorse 把所有模式都挂 text_to_video 做 kie 分流路由，
//   transportTaskKind 已被重载、不可信；slots 才是「这个模式吃不吃参考」的单一真相。
describe('不变量：video 可生成判定 ⟺ 当前模式无参考槽（防 t2v 按钮锁死类复发）', () => {
  const videoArchetypes = MODEL_ARCHETYPES.filter((a) => a.kind === 'video')
  it('覆盖到了 video 档案（防 registry 改动后空跑）', () => {
    expect(videoArchetypes.length).toBeGreaterThan(5)
  })
  for (const archetype of videoArchetypes) {
    for (const mode of archetype.modes || []) {
      const slotless = (mode.slots || []).length === 0
      it(`${archetype.id}/${mode.id}：空参考时可生成=${slotless}（slots=${(mode.slots || []).length}）`, () => {
        const node = {
          id: 'inv1', kind: 'video', title: 'v', position: { x: 0, y: 0 },
          prompt: slotless ? '一只猫跳下沙发' : '',
          meta: { modelKey: archetype.identifierPatterns?.[0] || archetype.id, archetype: { id: archetype.id, modeId: mode.id } },
        } as GenerationCanvasNode
        expect(canRunGenerationNode(node, { nodes: [node], edges: [] })).toBe(slotless)
      })
    }
  }
})

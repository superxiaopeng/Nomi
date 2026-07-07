import { beforeEach, describe, expect, it } from 'vitest'
import { useGenerationCanvasStore } from '../../store/generationCanvasStore'
import type { GenerationCanvasNode } from '../../model/generationCanvasTypes'
import { attachCameraMoveToTarget } from './cameraMoveTargetAttach'

function node(id: string, kind: GenerationCanvasNode['kind'], patch: Partial<GenerationCanvasNode> = {}): GenerationCanvasNode {
  return {
    id,
    kind,
    title: id,
    position: { x: 0, y: 0 },
    prompt: '',
    references: [],
    history: [],
    status: 'idle',
    meta: {},
    ...patch,
  }
}

function restore(nodes: GenerationCanvasNode[]): void {
  useGenerationCanvasStore.getState().restoreSnapshot({
    nodes,
    edges: [],
    selectedNodeIds: [],
    groups: [],
  })
}

function current(id: string): GenerationCanvasNode {
  const found = useGenerationCanvasStore.getState().nodes.find((candidate) => candidate.id === id)
  if (!found) throw new Error(`Missing node ${id}`)
  return found
}

describe('attachCameraMoveToTarget', () => {
  beforeEach(() => {
    restore([])
  })

  it('routes a recorded take into Seedance omni video_ref and preserves the variant axis', () => {
    restore([
      node('shot', 'video', {
        prompt: '城市街道里的主角回头',
        meta: {
          archetype: { id: 'seedance-2-apimart', modeId: 't2v', variantId: 'fast' },
          modelKey: 'doubao-seedance-2.0-fast',
          referenceVideoUrls: ['nomi-local://asset/old.mp4'],
        },
      }),
    ])

    attachCameraMoveToTarget('shot', 'nomi-local://asset/camera-move.mp4', 'push_in')

    const shot = current('shot')
    expect(shot.meta?.archetype).toEqual({ id: 'seedance-2-apimart', modeId: 'omni', variantId: 'fast' })
    expect(shot.meta?.referenceVideoUrls).toEqual([
      'nomi-local://asset/old.mp4',
      'nomi-local://asset/camera-move.mp4',
    ])
    expect(shot.meta?.cameraMoveAttached).toBe(true)
    expect(shot.prompt).toContain('@Video1 跟随这段参考视频的运镜')
  })

  it('is idempotent once a camera move has been attached', () => {
    restore([
      node('shot', 'video', {
        prompt: '已有 @Video1 指令',
        meta: {
          archetype: { id: 'seedance-2-apimart', modeId: 'omni', variantId: 'standard' },
          referenceVideoUrls: ['nomi-local://asset/camera-move.mp4'],
          cameraMoveAttached: true,
        },
      }),
    ])

    attachCameraMoveToTarget('shot', 'nomi-local://asset/another.mp4', 'pull_out')

    const shot = current('shot')
    expect(shot.meta?.referenceVideoUrls).toEqual(['nomi-local://asset/camera-move.mp4'])
    expect(shot.prompt).toBe('已有 @Video1 指令')
  })

  it('falls back to a structured camera move prompt when the video model has no video_ref slot', () => {
    restore([
      node('shot', 'video', {
        prompt: '纯文本视频镜头',
        meta: { archetype: { id: 'runninghub-seedance', modeId: 'text' } },
      }),
    ])

    attachCameraMoveToTarget('shot', 'nomi-local://asset/camera-move.mp4', 'push_in')

    const shot = current('shot')
    expect(shot.meta?.archetype).toEqual({ id: 'runninghub-seedance', modeId: 'text' })
    expect(shot.meta?.referenceVideoUrls).toBeUndefined()
    expect(shot.meta?.cameraMoveAttached).toBe(true)
    expect(shot.prompt).toContain('镜头运动：推近')
  })
})

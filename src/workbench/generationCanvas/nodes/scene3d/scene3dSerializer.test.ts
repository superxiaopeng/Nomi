import { describe, expect, it } from 'vitest'
import { cloneScene3DState, normalizeScene3DState } from './scene3dSerializer'

describe('normalizeScene3DState', () => {
  it('preserves panorama environment fields', () => {
    const state = normalizeScene3DState({
      environment: {
        panoramaUrl: 'nomi-local://asset/project/assets/upload/panorama.jpg',
        panoramaFileName: 'panorama.jpg',
        panoramaRotation: 1.25,
      },
    })

    expect(state.environment.panoramaUrl).toBe('nomi-local://asset/project/assets/upload/panorama.jpg')
    expect(state.environment.panoramaFileName).toBe('panorama.jpg')
    expect(state.environment.panoramaRotation).toBe(1.25)
  })

  it('drops unsupported panorama urls and defaults rotation', () => {
    const state = normalizeScene3DState({
      environment: {
        panoramaUrl: 'file:///Users/me/secret.jpg',
        panoramaRotation: Number.NaN,
      },
    })

    expect(state.environment.panoramaUrl).toBeUndefined()
    expect(state.environment.panoramaRotation).toBe(0)
  })

  it('round-trips poseTrack（解析 + 归一排序塌合）', () => {
    const state = normalizeScene3DState({
      objects: [{
        id: 'm1',
        type: 'mannequin',
        poseTrack: [
          { time: 2, presetId: 'squat', pose: { mixamorigSpine: [10, 0, 0] } },
          { time: 0, presetId: 'walk' },
          { time: -5, presetId: 'bogus' }, // 负时间丢弃
          { time: 1, presetId: 'walk' }, // 连续同 preset 塌合（留 time=0 那帧）
        ],
      }],
    })
    const track = state.objects[0].poseTrack
    expect(track?.map((k) => [k.time, k.presetId])).toEqual([[0, 'walk'], [2, 'squat']])
    expect(track?.[1].pose?.mixamorigSpine).toEqual([10, 0, 0])
  })

  it('cloneScene3DState 深拷贝 poseTrack（不共享 pose 引用）', () => {
    const state = normalizeScene3DState({
      objects: [{ id: 'm1', type: 'mannequin', poseTrack: [{ time: 0, presetId: 'squat', pose: { mixamorigSpine: [10, 0, 0] } }] }],
    })
    const cloned = cloneScene3DState(state)
    cloned.objects[0].poseTrack![0].pose!.mixamorigSpine[0] = 999
    expect(state.objects[0].poseTrack![0].pose!.mixamorigSpine[0]).toBe(10)
  })

  it('无 poseTrack 的对象保持 undefined（老行为）', () => {
    const state = normalizeScene3DState({ objects: [{ id: 'm1', type: 'mannequin' }] })
    expect(state.objects[0].poseTrack).toBeUndefined()
  })
})

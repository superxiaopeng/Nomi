import { describe, it, expect } from 'vitest'
import { objectWithPlaybackPose } from './scene3dPlayback'
import type { Scene3DObject, Scene3DVector3 } from './scene3dTypes'

const squat: Record<string, Scene3DVector3> = { mixamorigSpine: [10, 0, 0] }
const wave: Record<string, Scene3DVector3> = { mixamorigRightArm: [-40, 0, 0] }

const noTrajectory = { trajectories: [], trajectoryBindings: [] }

function mannequin(extra: Partial<Scene3DObject>): Scene3DObject {
  return {
    id: 'm1',
    name: '假人',
    type: 'mannequin',
    visible: true,
    position: [0, 1, 0],
    rotation: [0, 0, 0],
    scale: [1, 1, 1],
    ...extra,
  }
}

describe('objectWithPlaybackPose · pose-over-time', () => {
  it('无 poseTrack → pose 原样（老行为，未触轨迹则对象身份不变）', () => {
    const object = mannequin({ pose: squat })
    expect(objectWithPlaybackPose(noTrajectory, object, 3)).toBe(object)
  })

  it('有 poseTrack：随 t step-hold 切换 pose（即便无轨迹绑定，原地切动作也变）', () => {
    const object = mannequin({
      pose: undefined,
      poseTrack: [
        { time: 0, presetId: 'walk', pose: undefined },
        { time: 2, presetId: 'squat', pose: squat },
        { time: 4, presetId: 'wave', pose: wave },
      ],
    })
    expect(objectWithPlaybackPose(noTrajectory, object, 1).pose).toBeUndefined()
    expect(objectWithPlaybackPose(noTrajectory, object, 2).pose).toEqual(squat)
    expect(objectWithPlaybackPose(noTrajectory, object, 3.9).pose).toEqual(squat)
    expect(objectWithPlaybackPose(noTrajectory, object, 99).pose).toEqual(wave)
  })

  it('t 早于首关键帧 → 落回静态基准 object.pose', () => {
    const object = mannequin({
      pose: wave,
      poseTrack: [{ time: 5, presetId: 'squat', pose: squat }],
    })
    expect(objectWithPlaybackPose(noTrajectory, object, 1).pose).toEqual(wave)
    expect(objectWithPlaybackPose(noTrajectory, object, 5).pose).toEqual(squat)
  })

  it('空 poseTrack 数组 → 等同无轨道', () => {
    const object = mannequin({ pose: squat, poseTrack: [] })
    expect(objectWithPlaybackPose(noTrajectory, object, 3)).toBe(object)
  })
})

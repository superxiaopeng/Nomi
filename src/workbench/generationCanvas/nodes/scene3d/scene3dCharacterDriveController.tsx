import React from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import {
  type Scene3DMovementCode,
} from './scene3dConstants'
import {
  clearMovementKeyState,
  eulerToArray,
  findSceneObjectByRuntimeId,
  isEditableKeyboardTarget,
  isMovementCode,
} from './scene3dMath'
import {
  applyGroundTranslation,
  dampYaw,
  facingYawFromDirection,
  groundMoveDirection,
  groundSpeedForFlySpeed,
  locomotionForSpeed,
} from './scene3dCharacterDrive'
import { LOCOMOTION_CLIP_IDLE } from './scene3dConstants'
import type { Scene3DObject } from './scene3dTypes'

const TURN_LAMBDA = 11 // 自动面向转身的阻尼系数（越大转身越快）
const COMMIT_INTERVAL = 0.08 // 节流提交 state 的间隔(秒)，复用 CameraViewEditController 的 80ms

// 操控（possess）某假人的实时控制器。和相机 fly（Scene3DControls）是两条独立键盘路径：
// 只在 possess 激活时挂键盘、且相机 fly 此时被 Scene3DFullscreen 锁成 edit（viewLocked）让出 WASD。
// 直驱：每帧改被操控假人 group 的 position/rotation（不走 React），节流 80ms + dirty 检测后才提交 state，
// 照 CameraViewEditController 那套，避免每帧 setState 触发全场景 reconcile。
export function CharacterDriveController({
  possessedObject,
  flySpeed,
  locomotionClip,
  onObjectPatch,
  onLocomotionChange,
}: {
  possessedObject: Scene3DObject
  // header「速度」滑块(1–16，与相机 fly 同一个)。高档 → 地面速度越过 run 阈值播奔跑，低档走路。
  flySpeed: number
  // 当前 UI locomotion clip：idle/walk/run = 走位态；'' = 用户点了静态动作（蹲/挥手…）→ 停下做动作（#8）。
  // 由 useScene3DCharacterDrive.applyActionPreset 置空、由本控制器经 onLocomotionChange 重置回 idle/walk/run。
  locomotionClip?: string
  onObjectPatch: (id: string, patch: Partial<Scene3DObject>) => void
  // 当 locomotion 桶（idle/walk/run）变化时上抛——驱动被操控假人切迈腿动画 clip。仅在桶变化时调用（非每帧）。
  onLocomotionChange?: (clip: string) => void
}): null {
  const { camera, scene, invalidate } = useThree()
  // 滑块值放 ref，useFrame 每帧读最新值；改滑块不重订阅、不重挂键盘。
  const flySpeedRef = React.useRef(flySpeed)
  flySpeedRef.current = flySpeed
  const locomotionRef = React.useRef<string>(LOCOMOTION_CLIP_IDLE)
  // #8 静态动作「停下做动作，再走自动接回」：点蹲/挥手等静态动作（locomotionClip='')→ frozen=true，
  // 该状态下**不推进位移**（治「蹲着滑行」），且清掉按住的走位键，必须一次**新的**走位 keydown 才解冻接回走路。
  const staticActionFrozenRef = React.useRef(false)
  const objectIdRef = React.useRef(possessedObject.id)
  const groundYRef = React.useRef(possessedObject.position[1])
  const yawRef = React.useRef(possessedObject.rotation[1])
  const positionRef = React.useRef<THREE.Vector3>(
    new THREE.Vector3(possessedObject.position[0], possessedObject.position[1], possessedObject.position[2]),
  )
  const groupRef = React.useRef<THREE.Group | null>(null)
  const lastCommitTimeRef = React.useRef(0)
  const cameraEulerRef = React.useRef(new THREE.Euler(0, 0, 0, 'YXZ'))
  const keyStateRef = React.useRef<Record<Scene3DMovementCode, boolean>>({
    KeyW: false, KeyA: false, KeyS: false, KeyD: false,
    ArrowUp: false, ArrowDown: false, ArrowLeft: false, ArrowRight: false,
    Space: false, ShiftLeft: false, ShiftRight: false,
  })

  // 换被操控对象 / 外部改了它的 transform（如属性面板）→ 重新对齐驱动基准。
  React.useLayoutEffect(() => {
    objectIdRef.current = possessedObject.id
    groundYRef.current = possessedObject.position[1]
    yawRef.current = possessedObject.rotation[1]
    positionRef.current.set(
      possessedObject.position[0],
      possessedObject.position[1],
      possessedObject.position[2],
    )
    groupRef.current = findSceneObjectByRuntimeId(scene, possessedObject.id) as THREE.Group | null
  }, [possessedObject.id, possessedObject.position, possessedObject.rotation, scene])

  // #8：locomotionClip 切到 '' = 用户点了静态动作 → 冻结位移 + 清键（停下做动作，不滑行）。
  // 切回 idle/walk/run（如本控制器或外部恢复）→ 解冻。
  React.useLayoutEffect(() => {
    if (locomotionClip === '') {
      staticActionFrozenRef.current = true
      clearMovementKeyState(keyStateRef.current)
      // 失忆当前桶：解冻后第一次移动必触发桶变化上抛，把 locomotionClip 从 '' 接回 walk/run（否则停在静态姿势）。
      locomotionRef.current = ''
    } else if (locomotionClip) {
      staticActionFrozenRef.current = false
    }
  }, [locomotionClip])

  React.useEffect(() => {
    const keyState = keyStateRef.current
    const clearKeys = () => clearMovementKeyState(keyState)

    const handleKeyDown = (event: KeyboardEvent) => {
      if (isEditableKeyboardTarget(event.target) || !isMovementCode(event.code)) return
      if (event.ctrlKey || event.metaKey || event.altKey) return
      // 只接走位键（WASD/方向键），Space/Shift 不抬升角色（贴地不飞行）。
      if (event.code === 'Space' || event.code === 'ShiftLeft' || event.code === 'ShiftRight') return
      event.preventDefault()
      event.stopPropagation()
      // #8：静态动作冻结中收到「新的」走位 keydown → 解冻，本次按键即起步接回走路（不再滑行残留）。
      staticActionFrozenRef.current = false
      keyState[event.code] = true
      invalidate()
    }

    const handleKeyUp = (event: KeyboardEvent) => {
      if (!isMovementCode(event.code)) return
      keyState[event.code] = false
    }

    // capture: true 抢在相机 Scene3DControls 之前消费走位键，杜绝两条 WASD 路径争用。
    window.addEventListener('keydown', handleKeyDown, { capture: true })
    window.addEventListener('keyup', handleKeyUp, { capture: true })
    window.addEventListener('blur', clearKeys)
    return () => {
      window.removeEventListener('keydown', handleKeyDown, { capture: true })
      window.removeEventListener('keyup', handleKeyUp, { capture: true })
      window.removeEventListener('blur', clearKeys)
      clearMovementKeyState(keyState)
    }
  }, [invalidate])

  useFrame((state, delta) => {
    const group = groupRef.current
      ?? (findSceneObjectByRuntimeId(scene, objectIdRef.current) as THREE.Group | null)
    groupRef.current = group

    const cameraEuler = cameraEulerRef.current.setFromQuaternion(camera.quaternion, 'YXZ')
    // #8：静态动作冻结中 → 不读走位键、不推位移（停下做动作）。等一次新的走位 keydown 解冻接回。
    const frozen = staticActionFrozenRef.current
    const direction = frozen ? new THREE.Vector3(0, 0, 0) : groundMoveDirection(keyStateRef.current, cameraEuler.y)
    const moving = direction.lengthSq() > 0

    // 自动面向移动方向（平滑插值）；不移动则保持当前朝向。
    const targetYaw = facingYawFromDirection(direction)
    if (targetYaw !== null) {
      yawRef.current = dampYaw(yawRef.current, targetYaw, TURN_LAMBDA, delta)
    }

    const groundSpeed = moving ? groundSpeedForFlySpeed(flySpeedRef.current) : 0
    if (moving) {
      const step = groundSpeed * delta
      positionRef.current.x += direction.x * step
      positionRef.current.z += direction.z * step
    }

    // locomotion 桶（idle/walk/run）：由实时地面速度分桶，仅在桶变化时上抛切动画 clip（非每帧，无渲染风暴）。
    // #8 冻结中不上抛——否则 groundSpeed=0→idle 会把 locomotionClip 从 '' 顶成 'idle'，立刻解掉静态动作。
    //   保持显示用户点的静态姿势，直到一次新的走位 keydown 解冻、下一帧再正常上抛 walk/run 接回。
    if (!frozen) {
      const nextLocomotion = locomotionForSpeed(groundSpeed)
      if (nextLocomotion !== locomotionRef.current) {
        locomotionRef.current = nextLocomotion
        onLocomotionChange?.(nextLocomotion)
        invalidate()
      }
    }

    // 相机跟随由 Scene3DControls 的 followObjectId useFrame 负责（#3）：orbit 轴心+相机每帧随本 group
    // 世界位置同步平移，角色不飞出框，用户照旧可绕看/拉近。本控制器只管直驱 group，不碰相机链路。

    // 直驱 group（贴地：y 锁在落地时的基准）。
    if (group) {
      group.position.set(positionRef.current.x, groundYRef.current, positionRef.current.z)
      group.rotation.y = yawRef.current
      group.updateMatrixWorld()
    }

    const turning = targetYaw !== null && Math.abs(group ? group.rotation.y - (targetYaw) : 0) > 1e-4
    if (moving || turning) invalidate()

    // 节流提交 state（dirty 由 updateEditorCamera/patchObject 上游兜底，这里只控频率）。
    if (!moving && targetYaw === null) return
    if (state.clock.elapsedTime - lastCommitTimeRef.current < COMMIT_INTERVAL) return
    lastCommitTimeRef.current = state.clock.elapsedTime
    const nextPosition = applyGroundTranslation(
      [positionRef.current.x, groundYRef.current, positionRef.current.z],
      0,
      0,
      groundYRef.current,
    )
    const nextRotation = eulerToArray(
      new THREE.Euler(possessedObject.rotation[0], yawRef.current, possessedObject.rotation[2]),
    )
    onObjectPatch(objectIdRef.current, { position: nextPosition, rotation: nextRotation })
  })

  return null
}

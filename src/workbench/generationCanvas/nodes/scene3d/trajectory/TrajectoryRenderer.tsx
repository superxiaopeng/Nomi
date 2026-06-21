import React from 'react'
import { Html, Line, TransformControls } from '@react-three/drei'
import { IconCamera, IconChevronRight, IconPencil, IconPlus, IconTrash, IconUser } from '@tabler/icons-react'
import { useThree, type ThreeEvent } from '@react-three/fiber'
import * as THREE from 'three'
import type { Scene3DTrajectory, Scene3DTrajectoryPoint, Scene3DVector3 } from '../scene3dTypes'
import {
  buildTrajectoryCurve,
  createTrajectoryTubeGeometry,
  TRAJECTORY_CONTROL_POINT_RADIUS,
  trajectoryLinePoints,
  trajectorySegmentControlPosition,
  trajectorySegmentCount,
} from './trajectoryUtils'

type TrajectoryRendererProps = {
  trajectories: Scene3DTrajectory[]
  activeTrajectoryId?: string | null
  activePointId?: string | null
  editable: boolean
  wholeDraggable?: boolean
  onSelectTrajectory?: (trajectoryId: string) => void
  onSelectPoint?: (trajectoryId: string, pointId: string) => void
  onCreateTrajectoryAt?: (position: Scene3DVector3) => void
  onInsertPoint?: (
    trajectoryId: string,
    position: Scene3DVector3,
    targetPointId?: string | null,
    placement?: 'before' | 'after',
  ) => void
  onUpdateCurveControl?: (trajectoryId: string, segmentStartPointId: string, position: Scene3DVector3 | null) => void
  onUpdatePoint?: (trajectoryId: string, pointId: string, position: Scene3DVector3) => void
  onTranslateTrajectory?: (trajectoryId: string, delta: Scene3DVector3) => void
  onEditTrajectory?: (trajectoryId: string) => void
  onDeleteTrajectory?: (trajectoryId: string) => void
  bindTargets?: TrajectoryBindTarget[]
  onBindTargetToTrajectory?: (trajectoryId: string, targetId: string) => void
}

type PointerCaptureHost = EventTarget & {
  setPointerCapture?: (pointerId: number) => void
  releasePointerCapture?: (pointerId: number) => void
}

export type TrajectoryBindTarget = {
  id: string
  name: string
  type: 'mannequin' | 'camera'
}

type TrajectoryContextMenuState = {
  trajectoryId: string
  position: Scene3DVector3
}

type TrajectoryPointBindMenuState = {
  trajectoryId: string
  pointId: string
  position: Scene3DVector3
}

function pointerCaptureHost(target: unknown): PointerCaptureHost | null {
  return target && typeof target === 'object' ? target as PointerCaptureHost : null
}

const MIN_DRAG_DISTANCE = 0.04
const ENDPOINT_ADD_HIDE_DELAY_MS = 520
const TRAJECTORY_POINT_HIT_RADIUS = TRAJECTORY_CONTROL_POINT_RADIUS * 2.35
const SELECTED_TRAJECTORY_POINT_HIT_RADIUS = TRAJECTORY_CONTROL_POINT_RADIUS * 1.25
const TRAJECTORY_CURVE_HANDLE_RADIUS = 0.11
const TRAJECTORY_CURVE_HANDLE_HIT_RADIUS = 0.28

function vectorFromScene(value: Scene3DVector3): THREE.Vector3 {
  return new THREE.Vector3(value[0], value[1], value[2])
}

function vectorToScene(value: THREE.Vector3, y = value.y): Scene3DVector3 {
  return [
    Number(value.x.toFixed(4)),
    Number(y.toFixed(4)),
    Number(value.z.toFixed(4)),
  ]
}

function vectorDeltaToScene(value: THREE.Vector3): Scene3DVector3 {
  return [
    Number(value.x.toFixed(4)),
    0,
    Number(value.z.toFixed(4)),
  ]
}

function sceneDeltaMoved(delta: Scene3DVector3): boolean {
  return Math.abs(delta[0]) > 0.0001 || Math.abs(delta[2]) > 0.0001
}

function sceneVectorAlmostEqual(a: Scene3DVector3, b: Scene3DVector3, epsilon = 0.0001): boolean {
  return (
    Math.abs(a[0] - b[0]) <= epsilon &&
    Math.abs(a[1] - b[1]) <= epsilon &&
    Math.abs(a[2] - b[2]) <= epsilon
  )
}

function isTrajectoryEndpoint(trajectory: Scene3DTrajectory, pointIndex: number): boolean {
  if (trajectory.closed) return false
  return trajectory.points.length <= 1 || pointIndex === 0 || pointIndex === trajectory.points.length - 1
}

function endpointPlacement(trajectory: Scene3DTrajectory, pointIndex: number): 'before' | 'after' {
  return pointIndex === 0 && trajectory.points.length > 1 ? 'before' : 'after'
}

function endpointExtensionPosition(trajectory: Scene3DTrajectory, pointIndex: number): Scene3DVector3 {
  const point = trajectory.points[pointIndex]
  if (!point) return [0, 0, 0]

  const current = vectorFromScene(point.position)
  const neighborIndex = pointIndex === 0 ? 1 : pointIndex - 1
  const neighbor = trajectory.points[neighborIndex]
  if (!neighbor) {
    return [
      Number((point.position[0] + 1).toFixed(4)),
      point.position[1],
      point.position[2],
    ]
  }

  const direction = current.clone().sub(vectorFromScene(neighbor.position))
  const directionLength = direction.length()
  if (directionLength < 0.0001) {
    direction.set(pointIndex === 0 ? -1 : 1, 0, 0)
  } else {
    direction.multiplyScalar(1 / directionLength)
  }
  const distance = THREE.MathUtils.clamp(directionLength, 0.75, 2)
  return vectorToScene(current.add(direction.multiplyScalar(distance)), point.position[1])
}

function useTrajectoryWholeDrag({
  enabled,
  trajectoryId,
  onSelectTrajectory,
  onTranslateTrajectory,
}: {
  enabled: boolean
  trajectoryId: string
  onSelectTrajectory?: (trajectoryId: string) => void
  onTranslateTrajectory?: (trajectoryId: string, delta: Scene3DVector3) => void
}): (event: ThreeEvent<PointerEvent>) => void {
  const draggingRef = React.useRef(false)
  const pointerIdRef = React.useRef<number | null>(null)
  const lastUpdateTimeRef = React.useRef(0)
  const cameraRef = React.useRef<THREE.Camera | null>(null)
  const xzPlaneRef = React.useRef(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0))
  const hitRef = React.useRef(new THREE.Vector3())
  const lastPointRef = React.useRef(new THREE.Vector3())
  const pointerTargetRef = React.useRef<PointerCaptureHost | null>(null)
  const controlsEnabledBeforeDragRef = React.useRef<boolean | null>(null)
  const { controls, gl } = useThree()

  const projectPointer = React.useCallback((event: Pick<ThreeEvent<PointerEvent>, 'ray'>) => {
    const hit = event.ray.intersectPlane(xzPlaneRef.current, hitRef.current)
    return hit ? hit.clone() : null
  }, [])

  const projectClientPointer = React.useCallback((event: PointerEvent) => {
    const camera = cameraRef.current
    if (!camera) return null
    const canvas = gl.domElement
    const rect = canvas.getBoundingClientRect()
    if (rect.width <= 0 || rect.height <= 0) return null
    const ndc = new THREE.Vector2(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -(((event.clientY - rect.top) / rect.height) * 2 - 1),
    )
    const raycaster = new THREE.Raycaster()
    raycaster.setFromCamera(ndc, camera)
    const hit = raycaster.ray.intersectPlane(xzPlaneRef.current, hitRef.current)
    return hit ? hit.clone() : null
  }, [gl])

  const stopDrag = React.useCallback((pointerId: number) => {
    draggingRef.current = false
    pointerIdRef.current = null
    const target = pointerTargetRef.current
    pointerTargetRef.current = null
    target?.releasePointerCapture?.(pointerId)
    if (controls && 'enabled' in controls && controlsEnabledBeforeDragRef.current !== null) {
      ;(controls as { enabled: boolean }).enabled = controlsEnabledBeforeDragRef.current
      controlsEnabledBeforeDragRef.current = null
    }
  }, [controls])

  React.useEffect(() => {
    const handleWindowPointerMove = (event: PointerEvent) => {
      if (!draggingRef.current || pointerIdRef.current !== event.pointerId) return
      if (event.timeStamp - lastUpdateTimeRef.current < 16) return
      lastUpdateTimeRef.current = event.timeStamp
      const nextPoint = projectClientPointer(event)
      if (!nextPoint) return
      const delta = vectorDeltaToScene(nextPoint.clone().sub(lastPointRef.current))
      lastPointRef.current.copy(nextPoint)
      if (sceneDeltaMoved(delta)) onTranslateTrajectory?.(trajectoryId, delta)
    }
    const handleWindowPointerUp = (event: PointerEvent) => {
      if (!draggingRef.current || pointerIdRef.current !== event.pointerId) return
      stopDrag(event.pointerId)
    }
    window.addEventListener('pointermove', handleWindowPointerMove, { capture: true })
    window.addEventListener('pointerup', handleWindowPointerUp, { capture: true })
    window.addEventListener('pointercancel', handleWindowPointerUp, { capture: true })
    return () => {
      if (pointerIdRef.current !== null) stopDrag(pointerIdRef.current)
      window.removeEventListener('pointermove', handleWindowPointerMove, { capture: true })
      window.removeEventListener('pointerup', handleWindowPointerUp, { capture: true })
      window.removeEventListener('pointercancel', handleWindowPointerUp, { capture: true })
    }
  }, [onTranslateTrajectory, projectClientPointer, stopDrag, trajectoryId])

  return React.useCallback((event: ThreeEvent<PointerEvent>) => {
    if (!enabled || event.nativeEvent.button !== 0) return
    event.stopPropagation()
    const start = projectPointer(event)
    if (!start) return
    onSelectTrajectory?.(trajectoryId)
    cameraRef.current = event.camera
    pointerIdRef.current = event.pointerId
    lastUpdateTimeRef.current = event.nativeEvent.timeStamp
    lastPointRef.current.copy(start)
    draggingRef.current = true
    if (controls && 'enabled' in controls && controlsEnabledBeforeDragRef.current === null) {
      controlsEnabledBeforeDragRef.current = (controls as { enabled: boolean }).enabled
      ;(controls as { enabled: boolean }).enabled = false
    }
    const target = pointerCaptureHost(event.nativeEvent.target) ?? pointerCaptureHost(event.target)
    pointerTargetRef.current = target
    target?.setPointerCapture?.(event.pointerId)
  }, [controls, enabled, onSelectTrajectory, projectPointer, trajectoryId])
}

function TrajectoryEditPlane({
  onCreateTrajectory,
}: {
  onCreateTrajectory: (position: Scene3DVector3) => void
}): JSX.Element {
  return (
    <mesh
      rotation={[-Math.PI / 2, 0, 0]}
      onDoubleClick={(event) => {
        event.stopPropagation()
        const position: Scene3DVector3 = [
          Number(event.point.x.toFixed(4)),
          0,
          Number(event.point.z.toFixed(4)),
        ]
        onCreateTrajectory(position)
      }}
    >
      <planeGeometry args={[80, 80]} />
      <meshBasicMaterial transparent opacity={0} depthWrite={false} side={THREE.DoubleSide} />
    </mesh>
  )
}

function TrajectoryHitTube({
  trajectory,
  onWholePointerDown,
  onContextMenu,
  onSelectTrajectory,
}: {
  trajectory: Scene3DTrajectory
  onWholePointerDown?: (event: ThreeEvent<PointerEvent>) => void
  onContextMenu?: (trajectoryId: string, position: Scene3DVector3) => void
  onSelectTrajectory?: (trajectoryId: string) => void
}): JSX.Element | null {
  const curve = React.useMemo(() => buildTrajectoryCurve(trajectory), [trajectory])
  const geometry = React.useMemo(() => {
    if (!curve) return null
    return createTrajectoryTubeGeometry(curve, trajectory.points.length)
  }, [curve, trajectory.points.length])

  React.useEffect(() => () => {
    geometry?.dispose()
  }, [geometry])

  if (!geometry) return null

  return (
    <mesh
      geometry={geometry}
      onPointerDown={onWholePointerDown}
      onClick={(event) => {
        event.stopPropagation()
        onSelectTrajectory?.(trajectory.id)
      }}
      onDoubleClick={(event) => {
        event.stopPropagation()
        onSelectTrajectory?.(trajectory.id)
      }}
      onContextMenu={(event) => {
        event.stopPropagation()
        event.nativeEvent.preventDefault()
        onContextMenu?.(trajectory.id, vectorToScene(event.point))
      }}
    >
      <meshBasicMaterial transparent opacity={0} depthWrite={false} color="#ffffff" />
    </mesh>
  )
}

function TrajectoryContextMenu({
  menu,
  onClose,
  onEditTrajectory,
  onDeleteTrajectory,
}: {
  menu: TrajectoryContextMenuState | null
  onClose: () => void
  onEditTrajectory?: (trajectoryId: string) => void
  onDeleteTrajectory?: (trajectoryId: string) => void
}): JSX.Element | null {
  React.useEffect(() => {
    if (!menu) return undefined
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target
      if (target instanceof Element && target.closest('[data-trajectory-context-menu="true"]')) return
      onClose()
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('pointerdown', handlePointerDown, true)
    window.addEventListener('keydown', handleKeyDown, true)
    return () => {
      window.removeEventListener('pointerdown', handlePointerDown, true)
      window.removeEventListener('keydown', handleKeyDown, true)
    }
  }, [menu, onClose])

  if (!menu) return null

  return (
    <Html
      center
      distanceFactor={8}
      position={menu.position}
      style={{ pointerEvents: 'auto' }}
      zIndexRange={[24, 0]}
    >
      <div
        className="min-w-[116px] overflow-hidden rounded-[8px] border border-[var(--nomi-line-soft)] bg-[var(--nomi-paper)] p-1 text-[12px] text-[var(--nomi-ink)] shadow-[0_14px_34px_rgba(18,24,38,0.2)]"
        data-trajectory-context-menu="true"
        onContextMenu={(event) => {
          event.preventDefault()
          event.stopPropagation()
        }}
        onPointerDown={(event) => event.stopPropagation()}
      >
        <button
          type="button"
          className="flex h-8 w-full items-center gap-2 rounded-[6px] px-2 text-left hover:bg-[var(--nomi-ink-05)]"
          onClick={(event) => {
            event.preventDefault()
            event.stopPropagation()
            onClose()
            onEditTrajectory?.(menu.trajectoryId)
          }}
        >
          <IconPencil size={14} stroke={1.9} />
          <span>编辑</span>
        </button>
        <button
          type="button"
          className="flex h-8 w-full items-center gap-2 rounded-[6px] px-2 text-left text-red-500 hover:bg-red-50"
          onClick={(event) => {
            event.preventDefault()
            event.stopPropagation()
            onClose()
            onDeleteTrajectory?.(menu.trajectoryId)
          }}
        >
          <IconTrash size={14} stroke={1.9} />
          <span>删除</span>
        </button>
      </div>
    </Html>
  )
}

function TrajectoryPointBindMenu({
  menu,
  targets,
  onClose,
  onBindTarget,
}: {
  menu: TrajectoryPointBindMenuState | null
  targets: TrajectoryBindTarget[]
  onClose: () => void
  onBindTarget?: (trajectoryId: string, targetId: string) => void
}): JSX.Element | null {
  const [hoveredType, setHoveredType] = React.useState<TrajectoryBindTarget['type']>('mannequin')
  const targetsByType = React.useMemo(() => ({
    mannequin: targets.filter((target) => target.type === 'mannequin'),
    camera: targets.filter((target) => target.type === 'camera'),
  }), [targets])

  React.useEffect(() => {
    if (!menu) return undefined
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target
      if (target instanceof Element && target.closest('[data-trajectory-point-bind-menu="true"]')) return
      onClose()
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('pointerdown', handlePointerDown, true)
    window.addEventListener('keydown', handleKeyDown, true)
    return () => {
      window.removeEventListener('pointerdown', handlePointerDown, true)
      window.removeEventListener('keydown', handleKeyDown, true)
    }
  }, [menu, onClose])

  React.useEffect(() => {
    if (!menu) return
    setHoveredType(targetsByType.mannequin.length > 0 ? 'mannequin' : 'camera')
  }, [menu, targetsByType.mannequin.length])

  if (!menu) return null

  const categories: Array<{
    type: TrajectoryBindTarget['type']
    label: string
    icon: JSX.Element
    items: TrajectoryBindTarget[]
  }> = [
    { type: 'mannequin', label: '假人', icon: <IconUser size={14} stroke={1.9} />, items: targetsByType.mannequin },
    { type: 'camera', label: '相机', icon: <IconCamera size={14} stroke={1.9} />, items: targetsByType.camera },
  ]
  const hoveredItems = targetsByType[hoveredType]

  return (
    <Html
      center
      distanceFactor={8}
      position={menu.position}
      style={{ pointerEvents: 'auto' }}
      zIndexRange={[26, 0]}
    >
      <div
        className="relative min-w-[126px] rounded-[8px] border border-[var(--nomi-line-soft)] bg-[var(--nomi-paper)] p-1 text-[12px] text-[var(--nomi-ink)] shadow-[0_14px_34px_rgba(18,24,38,0.22)]"
        data-trajectory-point-bind-menu="true"
        onContextMenu={(event) => {
          event.preventDefault()
          event.stopPropagation()
        }}
        onPointerDown={(event) => event.stopPropagation()}
      >
        {categories.map((category) => (
          <button
            key={category.type}
            type="button"
            className="flex h-8 w-full items-center gap-2 rounded-[6px] px-2 text-left hover:bg-[var(--nomi-ink-05)]"
            onMouseEnter={() => setHoveredType(category.type)}
            onFocus={() => setHoveredType(category.type)}
          >
            {category.icon}
            <span className="min-w-0 flex-1 truncate">{category.label}</span>
            <span className="text-[10px] text-[var(--nomi-ink-45)]">{category.items.length}</span>
            <IconChevronRight size={13} stroke={1.9} />
          </button>
        ))}
        <div className="absolute left-[calc(100%+6px)] top-1 min-w-[148px] rounded-[8px] border border-[var(--nomi-line-soft)] bg-[var(--nomi-paper)] p-1 shadow-[0_14px_34px_rgba(18,24,38,0.2)]">
          {hoveredItems.length === 0 ? (
            <div className="px-2 py-2 text-[11px] text-[var(--nomi-ink-45)]">暂无可绑定节点</div>
          ) : hoveredItems.map((target) => (
            <button
              key={target.id}
              type="button"
              className="flex h-8 w-full min-w-0 items-center gap-2 rounded-[6px] px-2 text-left hover:bg-[var(--nomi-ink-05)]"
              onClick={(event) => {
                event.preventDefault()
                event.stopPropagation()
                onBindTarget?.(menu.trajectoryId, target.id)
                onClose()
              }}
            >
              {target.type === 'camera' ? <IconCamera size={14} stroke={1.9} /> : <IconUser size={14} stroke={1.9} />}
              <span className="min-w-0 flex-1 truncate">{target.name}</span>
            </button>
          ))}
        </div>
      </div>
    </Html>
  )
}

function TrajectoryPointTransformControls({
  trajectoryId,
  point,
  enabled,
  onTransformPointerDown,
  onTransformPointerUp,
  onSelectPoint,
  onUpdatePoint,
}: {
  trajectoryId: string
  point: Scene3DTrajectoryPoint
  enabled: boolean
  onTransformPointerDown?: (pointerId: number) => void
  onTransformPointerUp?: (pointerId: number) => void
  onSelectPoint?: (trajectoryId: string, pointId: string) => void
  onUpdatePoint?: (trajectoryId: string, pointId: string, position: Scene3DVector3) => void
}): JSX.Element | null {
  const anchorRef = React.useRef<THREE.Group>(null!) as React.MutableRefObject<THREE.Group>
  const transformRef = React.useRef<any>(null)
  const draggingRef = React.useRef(false)
  const controlsEnabledBeforeDragRef = React.useRef<boolean | null>(null)
  const { controls } = useThree()

  const restoreControls = React.useCallback(() => {
    if (controls && 'enabled' in controls && controlsEnabledBeforeDragRef.current !== null) {
      ;(controls as { enabled: boolean }).enabled = controlsEnabledBeforeDragRef.current
    }
    controlsEnabledBeforeDragRef.current = null
  }, [controls])

  const updatePointFromAnchor = React.useCallback((options?: { force?: boolean }) => {
    if (!draggingRef.current && !options?.force) return
    const anchor = anchorRef.current
    if (!anchor) return
    const position = vectorToScene(anchor.position)
    if (sceneVectorAlmostEqual(point.position, position)) return
    onUpdatePoint?.(trajectoryId, point.id, position)
  }, [onUpdatePoint, point.id, point.position, trajectoryId])

  const startTransform = React.useCallback(() => {
    onSelectPoint?.(trajectoryId, point.id)
    draggingRef.current = true
    if (controls && 'enabled' in controls && controlsEnabledBeforeDragRef.current === null) {
      controlsEnabledBeforeDragRef.current = (controls as { enabled: boolean }).enabled
      ;(controls as { enabled: boolean }).enabled = false
    }
  }, [controls, onSelectPoint, point.id, trajectoryId])

  const stopTransform = React.useCallback(() => {
    updatePointFromAnchor({ force: true })
    draggingRef.current = false
    restoreControls()
  }, [restoreControls, updatePointFromAnchor])

  React.useLayoutEffect(() => {
    if (!anchorRef.current || draggingRef.current) return
    anchorRef.current.position.fromArray(point.position)
  }, [point.position])

  React.useEffect(() => {
    const transform = transformRef.current
    if (!transform) return
    const handleDraggingChanged = (event: { value: boolean }) => {
      if (event.value) {
        startTransform()
        return
      }
      stopTransform()
    }
    transform.addEventListener('dragging-changed', handleDraggingChanged)
    return () => {
      if (draggingRef.current) stopTransform()
      transform.removeEventListener('dragging-changed', handleDraggingChanged)
    }
  }, [startTransform, stopTransform])

  if (!enabled) return null

  return (
    <>
      <group ref={anchorRef} position={point.position} />
      <TransformControls
        ref={transformRef}
        object={anchorRef}
        mode="translate"
        showX
        showY
        showZ
        size={0.72}
        space="world"
        onClick={(event) => event.stopPropagation()}
        onDoubleClick={(event) => event.stopPropagation()}
        onMouseDown={startTransform}
        onMouseUp={stopTransform}
        onObjectChange={() => updatePointFromAnchor()}
        onPointerDown={(event) => onTransformPointerDown?.(event.pointerId)}
        onPointerUp={(event) => onTransformPointerUp?.(event.pointerId)}
      />
    </>
  )
}

function TrajectoryControlPoint({
  trajectory,
  activePointId,
  point,
  active,
  editable,
  onPointerHover,
  onPointerUnhover,
  onSelectTrajectory,
  onSelectPoint,
  onWholePointerDown,
  onContextMenu,
  onPointContextMenu,
  onUpdatePoint,
}: {
  trajectory: Scene3DTrajectory
  activePointId?: string | null
  point: Scene3DTrajectoryPoint
  active: boolean
  editable: boolean
  onPointerHover?: () => void
  onPointerUnhover?: () => void
  onSelectTrajectory?: (trajectoryId: string) => void
  onSelectPoint?: (trajectoryId: string, pointId: string) => void
  onWholePointerDown?: (event: ThreeEvent<PointerEvent>) => void
  onContextMenu?: (trajectoryId: string, position: Scene3DVector3) => void
  onPointContextMenu?: (trajectoryId: string, pointId: string, position: Scene3DVector3) => void
  onUpdatePoint?: (trajectoryId: string, pointId: string, position: Scene3DVector3) => void
}): JSX.Element {
  const draggingRef = React.useRef(false)
  const movedRef = React.useRef(false)
  const lastUpdateTimeRef = React.useRef(0)
  const pointerIdRef = React.useRef<number | null>(null)
  const cameraRef = React.useRef<THREE.Camera | null>(null)
  const xzPlaneRef = React.useRef(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0))
  const hitRef = React.useRef(new THREE.Vector3())
  const pointerTargetRef = React.useRef<PointerCaptureHost | null>(null)
  const dragStartRef = React.useRef(vectorFromScene(point.position))
  const pointStartRef = React.useRef(vectorFromScene(point.position))
  const lastEndRef = React.useRef(vectorFromScene(point.position))
  const controlsEnabledBeforeDraftRef = React.useRef<boolean | null>(null)
  const transformPointerIdRef = React.useRef<number | null>(null)
  const { controls, gl } = useThree()
  const selected = active && point.id === activePointId
  const color = selected ? '#facc15' : active ? '#c084fc' : trajectory.color

  const projectPointer = React.useCallback((event: Pick<ThreeEvent<PointerEvent>, 'ray'>) => {
    const hit = event.ray.intersectPlane(xzPlaneRef.current, hitRef.current)
    return hit ? hit.clone() : null
  }, [])

  const projectClientPointer = React.useCallback((event: PointerEvent) => {
    const camera = cameraRef.current
    if (!camera) return null
    const canvas = gl.domElement
    if (!canvas) return null
    const rect = canvas.getBoundingClientRect()
    if (rect.width <= 0 || rect.height <= 0) return null
    const ndc = new THREE.Vector2(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -(((event.clientY - rect.top) / rect.height) * 2 - 1),
    )
    const raycaster = new THREE.Raycaster()
    raycaster.setFromCamera(ndc, camera)
    const hit = raycaster.ray.intersectPlane(xzPlaneRef.current, hitRef.current)
    return hit ? hit.clone() : null
  }, [gl])

  const commitDraft = React.useCallback((end: THREE.Vector3, pointerId: number) => {
    draggingRef.current = false
    pointerIdRef.current = null
    const target = pointerTargetRef.current
    pointerTargetRef.current = null
    target?.releasePointerCapture?.(pointerId)
    if (controls && 'enabled' in controls && controlsEnabledBeforeDraftRef.current !== null) {
      ;(controls as { enabled: boolean }).enabled = controlsEnabledBeforeDraftRef.current
      controlsEnabledBeforeDraftRef.current = null
    }
    const moved = movedRef.current || end.distanceTo(pointStartRef.current) >= MIN_DRAG_DISTANCE
    if (moved) onUpdatePoint?.(trajectory.id, point.id, vectorToScene(end, point.position[1]))
  }, [controls, onUpdatePoint, point.id, point.position, trajectory.id])

  React.useEffect(() => {
    const handleWindowPointerMove = (event: PointerEvent) => {
      if (!draggingRef.current || pointerIdRef.current !== event.pointerId) return
      if (event.timeStamp - lastUpdateTimeRef.current < 16) return
      lastUpdateTimeRef.current = event.timeStamp
      const pointerEnd = projectClientPointer(event)
      if (!pointerEnd) return
      if (pointerEnd.distanceTo(dragStartRef.current) >= MIN_DRAG_DISTANCE) {
        movedRef.current = true
      }
      const end = pointStartRef.current.clone().add(pointerEnd.clone().sub(dragStartRef.current))
      lastEndRef.current = end
      onUpdatePoint?.(trajectory.id, point.id, vectorToScene(end, point.position[1]))
    }
    const handleWindowPointerUp = (event: PointerEvent) => {
      if (transformPointerIdRef.current === event.pointerId) {
        transformPointerIdRef.current = null
      }
      if (!draggingRef.current || pointerIdRef.current !== event.pointerId) return
      const pointerEnd = projectClientPointer(event)
      const end = pointerEnd
        ? pointStartRef.current.clone().add(pointerEnd.clone().sub(dragStartRef.current))
        : lastEndRef.current
      if (pointerEnd && pointerEnd.distanceTo(dragStartRef.current) >= MIN_DRAG_DISTANCE) {
        movedRef.current = true
      }
      commitDraft(end, event.pointerId)
    }
    window.addEventListener('pointermove', handleWindowPointerMove, { capture: true })
    window.addEventListener('pointerup', handleWindowPointerUp, { capture: true })
    window.addEventListener('pointercancel', handleWindowPointerUp, { capture: true })
    return () => {
      if (controls && 'enabled' in controls && controlsEnabledBeforeDraftRef.current !== null) {
        ;(controls as { enabled: boolean }).enabled = controlsEnabledBeforeDraftRef.current
        controlsEnabledBeforeDraftRef.current = null
      }
      window.removeEventListener('pointermove', handleWindowPointerMove, { capture: true })
      window.removeEventListener('pointerup', handleWindowPointerUp, { capture: true })
      window.removeEventListener('pointercancel', handleWindowPointerUp, { capture: true })
    }
  }, [commitDraft, onUpdatePoint, point.id, point.position, projectClientPointer, trajectory.id])

  const handlePointPointerOver = React.useCallback((event: ThreeEvent<PointerEvent>) => {
    event.stopPropagation()
    onPointerHover?.()
  }, [onPointerHover])

  const handlePointPointerOut = React.useCallback((event: ThreeEvent<PointerEvent>) => {
    event.stopPropagation()
    onPointerUnhover?.()
  }, [onPointerUnhover])

  const handlePointPointerDown = React.useCallback((event: ThreeEvent<PointerEvent>) => {
    if (event.nativeEvent.button !== 0) return
    if (transformPointerIdRef.current === event.pointerId) return
    event.stopPropagation()
    onSelectTrajectory?.(trajectory.id)
    if (!editable) {
      onWholePointerDown?.(event)
      return
    }
    cameraRef.current = event.camera
    pointerIdRef.current = event.pointerId
    if (controls && 'enabled' in controls && controlsEnabledBeforeDraftRef.current === null) {
      controlsEnabledBeforeDraftRef.current = (controls as { enabled: boolean }).enabled
      ;(controls as { enabled: boolean }).enabled = false
    }
    onSelectPoint?.(trajectory.id, point.id)
    draggingRef.current = true
    movedRef.current = false
    lastUpdateTimeRef.current = event.nativeEvent.timeStamp
    const target = pointerCaptureHost(event.nativeEvent.target) ?? pointerCaptureHost(event.target)
    pointerTargetRef.current = target
    target?.setPointerCapture?.(event.pointerId)
    const pointStart = vectorFromScene(point.position)
    const pointerStart = projectPointer(event) ?? pointStart.clone()
    dragStartRef.current = pointerStart
    pointStartRef.current = pointStart
    lastEndRef.current = pointStart
  }, [controls, editable, onSelectPoint, onSelectTrajectory, onWholePointerDown, point.id, point.position, projectPointer, trajectory.id])

  const handlePointPointerUp = React.useCallback((event: ThreeEvent<PointerEvent>) => {
    if (transformPointerIdRef.current === event.pointerId) return
    if (!draggingRef.current) return
    event.stopPropagation()
    const pointerEnd = projectPointer(event)
    const end = pointerEnd
      ? pointStartRef.current.clone().add(pointerEnd.clone().sub(dragStartRef.current))
      : lastEndRef.current
    if (pointerEnd && pointerEnd.distanceTo(dragStartRef.current) >= MIN_DRAG_DISTANCE) {
      movedRef.current = true
    }
    commitDraft(end, event.pointerId)
  }, [commitDraft, projectPointer])

  const handlePointDoubleClick = React.useCallback((event: ThreeEvent<MouseEvent>) => {
    event.stopPropagation()
  }, [])

  const markTransformPointer = React.useCallback((pointerId: number) => {
    transformPointerIdRef.current = pointerId
  }, [])

  const clearTransformPointer = React.useCallback((pointerId: number) => {
    if (transformPointerIdRef.current === pointerId) transformPointerIdRef.current = null
  }, [])

  return (
    <>
      <mesh
        position={point.position}
        renderOrder={6}
        onPointerOver={handlePointPointerOver}
        onPointerOut={handlePointPointerOut}
        onPointerDown={handlePointPointerDown}
        onPointerUp={handlePointPointerUp}
        onDoubleClick={handlePointDoubleClick}
        onContextMenu={(event) => {
          event.stopPropagation()
          event.nativeEvent.preventDefault()
          if (editable && onPointContextMenu) {
            onPointContextMenu(trajectory.id, point.id, vectorToScene(event.point, point.position[1]))
            return
          }
          onContextMenu?.(trajectory.id, vectorToScene(event.point, point.position[1]))
        }}
      >
        <sphereGeometry args={[selected ? SELECTED_TRAJECTORY_POINT_HIT_RADIUS : TRAJECTORY_POINT_HIT_RADIUS, 18, 12]} />
        <meshBasicMaterial
          color="#ffffff"
          depthWrite={false}
          opacity={0}
          transparent
          toneMapped={false}
        />
      </mesh>
      <mesh
        position={point.position}
        renderOrder={5}
      >
        <sphereGeometry args={[TRAJECTORY_CONTROL_POINT_RADIUS, 18, 12]} />
        <meshBasicMaterial
          color={color}
          depthTest={false}
          opacity={editable ? 1 : 0.68}
          transparent
          toneMapped={false}
        />
      </mesh>
      <TrajectoryPointTransformControls
        trajectoryId={trajectory.id}
        point={point}
        enabled={selected && editable}
        onTransformPointerDown={markTransformPointer}
        onTransformPointerUp={clearTransformPointer}
        onSelectPoint={onSelectPoint}
        onUpdatePoint={onUpdatePoint}
      />
    </>
  )
}

function TrajectoryEndpointAddButton({
  trajectory,
  pointIndex,
  visible,
  onKeepVisible,
  onRequestHide,
  onSelectTrajectory,
  onSelectPoint,
  onInsertPoint,
}: {
  trajectory: Scene3DTrajectory
  pointIndex: number
  visible: boolean
  onKeepVisible: () => void
  onRequestHide: () => void
  onSelectTrajectory?: (trajectoryId: string) => void
  onSelectPoint?: (trajectoryId: string, pointId: string) => void
  onInsertPoint?: (
    trajectoryId: string,
    position: Scene3DVector3,
    targetPointId?: string | null,
    placement?: 'before' | 'after',
  ) => void
}): JSX.Element | null {
  const point = trajectory.points[pointIndex]
  const addPosition = React.useMemo(() => endpointExtensionPosition(trajectory, pointIndex), [trajectory, pointIndex])
  const placement = endpointPlacement(trajectory, pointIndex)

  if (!point || !visible) return null

  return (
    <>
      <Line
        points={[vectorFromScene(point.position), vectorFromScene(addPosition)]}
        color={trajectory.color}
        lineWidth={2}
        transparent
        opacity={0.48}
        depthTest={false}
        renderOrder={1}
      />
      <Html
        center
        distanceFactor={8}
        position={addPosition}
        style={{ pointerEvents: 'auto' }}
        zIndexRange={[20, 0]}
      >
        <button
          type="button"
          aria-label="连接新轨迹点"
          title="连接新轨迹点"
          className="grid size-8 place-items-center rounded-full border border-white/85 bg-[var(--nomi-ink)] text-[var(--nomi-paper)] shadow-[0_8px_20px_rgba(18,24,38,0.24)] transition hover:scale-105"
          onClick={(event) => {
            event.preventDefault()
            event.stopPropagation()
            onSelectTrajectory?.(trajectory.id)
            onSelectPoint?.(trajectory.id, point.id)
            onInsertPoint?.(trajectory.id, addPosition, point.id, placement)
          }}
          onPointerDown={(event) => {
            event.preventDefault()
            event.stopPropagation()
            onKeepVisible()
          }}
          onPointerEnter={onKeepVisible}
          onPointerLeave={onRequestHide}
          onPointerUp={(event) => {
            event.preventDefault()
            event.stopPropagation()
          }}
          onDoubleClick={(event) => {
            event.preventDefault()
            event.stopPropagation()
          }}
        >
          <IconPlus size={16} stroke={2.4} />
        </button>
      </Html>
    </>
  )
}

function TrajectoryCurveControlHandle({
  trajectory,
  segmentIndex,
  visible,
  onSelectTrajectory,
  onUpdateCurveControl,
}: {
  trajectory: Scene3DTrajectory
  segmentIndex: number
  visible: boolean
  onSelectTrajectory?: (trajectoryId: string) => void
  onUpdateCurveControl?: (trajectoryId: string, segmentStartPointId: string, position: Scene3DVector3 | null) => void
}): JSX.Element | null {
  const startPoint = trajectory.points[segmentIndex]
  const endPoint = trajectory.points[(segmentIndex + 1) % trajectory.points.length]
  const controlPosition = React.useMemo(() => trajectorySegmentControlPosition(trajectory, segmentIndex), [trajectory, segmentIndex])
  const stored = Boolean(startPoint && trajectory.curveControls?.some((control) => control.segmentStartPointId === startPoint.id))
  const [hovered, setHovered] = React.useState(false)
  const draggingRef = React.useRef(false)
  const movedRef = React.useRef(false)
  const pointerIdRef = React.useRef<number | null>(null)
  const cameraRef = React.useRef<THREE.Camera | null>(null)
  const xzPlaneRef = React.useRef(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0))
  const hitRef = React.useRef(new THREE.Vector3())
  const dragStartRef = React.useRef(new THREE.Vector3())
  const handleStartRef = React.useRef(new THREE.Vector3())
  const pointerTargetRef = React.useRef<PointerCaptureHost | null>(null)
  const controlsEnabledBeforeDragRef = React.useRef<boolean | null>(null)
  const { controls, gl } = useThree()

  const projectPointer = React.useCallback((event: Pick<ThreeEvent<PointerEvent>, 'ray'>) => {
    const hit = event.ray.intersectPlane(xzPlaneRef.current, hitRef.current)
    return hit ? hit.clone() : null
  }, [])

  const projectClientPointer = React.useCallback((event: PointerEvent) => {
    const camera = cameraRef.current
    if (!camera) return null
    const rect = gl.domElement.getBoundingClientRect()
    if (rect.width <= 0 || rect.height <= 0) return null
    const ndc = new THREE.Vector2(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -(((event.clientY - rect.top) / rect.height) * 2 - 1),
    )
    const raycaster = new THREE.Raycaster()
    raycaster.setFromCamera(ndc, camera)
    const hit = raycaster.ray.intersectPlane(xzPlaneRef.current, hitRef.current)
    return hit ? hit.clone() : null
  }, [gl])

  const stopDrag = React.useCallback((pointerId: number) => {
    draggingRef.current = false
    pointerIdRef.current = null
    const target = pointerTargetRef.current
    pointerTargetRef.current = null
    target?.releasePointerCapture?.(pointerId)
    if (controls && 'enabled' in controls && controlsEnabledBeforeDragRef.current !== null) {
      ;(controls as { enabled: boolean }).enabled = controlsEnabledBeforeDragRef.current
      controlsEnabledBeforeDragRef.current = null
    }
  }, [controls])

  React.useEffect(() => {
    const handleWindowPointerMove = (event: PointerEvent) => {
      if (!draggingRef.current || pointerIdRef.current !== event.pointerId || !startPoint) return
      const pointerEnd = projectClientPointer(event)
      if (!pointerEnd) return
      if (pointerEnd.distanceTo(dragStartRef.current) >= MIN_DRAG_DISTANCE) movedRef.current = true
      const next = handleStartRef.current.clone().add(pointerEnd.clone().sub(dragStartRef.current))
      onUpdateCurveControl?.(trajectory.id, startPoint.id, vectorToScene(next))
    }
    const handleWindowPointerUp = (event: PointerEvent) => {
      if (!draggingRef.current || pointerIdRef.current !== event.pointerId) return
      stopDrag(event.pointerId)
    }
    window.addEventListener('pointermove', handleWindowPointerMove, { capture: true })
    window.addEventListener('pointerup', handleWindowPointerUp, { capture: true })
    window.addEventListener('pointercancel', handleWindowPointerUp, { capture: true })
    return () => {
      if (pointerIdRef.current !== null) stopDrag(pointerIdRef.current)
      window.removeEventListener('pointermove', handleWindowPointerMove, { capture: true })
      window.removeEventListener('pointerup', handleWindowPointerUp, { capture: true })
      window.removeEventListener('pointercancel', handleWindowPointerUp, { capture: true })
    }
  }, [onUpdateCurveControl, projectClientPointer, startPoint, stopDrag, trajectory.id])

  if (!startPoint || !endPoint || !controlPosition || !visible) return null

  const start = vectorFromScene(startPoint.position)
  const end = vectorFromScene(endPoint.position)
  const guideVisible = stored || hovered || draggingRef.current

  return (
    <>
      {guideVisible ? (
        <Line
          points={[start, controlPosition, end]}
          color="#06b6d4"
          lineWidth={1.4}
          transparent
          opacity={0.48}
          depthTest={false}
          renderOrder={3}
        />
      ) : null}
      <mesh
        position={controlPosition}
        renderOrder={7}
        onPointerOver={(event) => {
          event.stopPropagation()
          setHovered(true)
        }}
        onPointerOut={(event) => {
          event.stopPropagation()
          setHovered(false)
        }}
        onPointerDown={(event) => {
          if (event.nativeEvent.button !== 0) return
          event.stopPropagation()
          onSelectTrajectory?.(trajectory.id)
          cameraRef.current = event.camera
          xzPlaneRef.current.constant = -controlPosition.y
          const pointerStart = projectPointer(event) ?? controlPosition.clone()
          dragStartRef.current.copy(pointerStart)
          handleStartRef.current.copy(controlPosition)
          draggingRef.current = true
          movedRef.current = false
          pointerIdRef.current = event.pointerId
          if (controls && 'enabled' in controls && controlsEnabledBeforeDragRef.current === null) {
            controlsEnabledBeforeDragRef.current = (controls as { enabled: boolean }).enabled
            ;(controls as { enabled: boolean }).enabled = false
          }
          const target = pointerCaptureHost(event.nativeEvent.target) ?? pointerCaptureHost(event.target)
          pointerTargetRef.current = target
          target?.setPointerCapture?.(event.pointerId)
        }}
        onPointerUp={(event) => {
          if (!draggingRef.current) return
          event.stopPropagation()
          stopDrag(event.pointerId)
        }}
        onDoubleClick={(event) => {
          event.stopPropagation()
          onUpdateCurveControl?.(trajectory.id, startPoint.id, null)
        }}
      >
        <sphereGeometry args={[TRAJECTORY_CURVE_HANDLE_HIT_RADIUS, 16, 10]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} toneMapped={false} />
      </mesh>
      <mesh position={controlPosition} renderOrder={6}>
        <sphereGeometry args={[TRAJECTORY_CURVE_HANDLE_RADIUS, 16, 10]} />
        <meshBasicMaterial
          color={stored ? '#06b6d4' : '#67e8f9'}
          depthTest={false}
          opacity={stored || hovered ? 1 : 0.72}
          transparent
          toneMapped={false}
        />
      </mesh>
    </>
  )
}

function TrajectoryLineView({
  trajectory,
  active,
  activePointId,
  editable,
  wholeDraggable,
  onSelectTrajectory,
  onSelectPoint,
  onInsertPoint,
  onUpdateCurveControl,
  onUpdatePoint,
  onTranslateTrajectory,
  onContextMenu,
  onPointContextMenu,
}: {
  trajectory: Scene3DTrajectory
  active: boolean
  activePointId?: string | null
  editable: boolean
  wholeDraggable?: boolean
  onSelectTrajectory?: (trajectoryId: string) => void
  onSelectPoint?: (trajectoryId: string, pointId: string) => void
  onInsertPoint?: (
    trajectoryId: string,
    position: Scene3DVector3,
    targetPointId?: string | null,
    placement?: 'before' | 'after',
  ) => void
  onUpdateCurveControl?: (trajectoryId: string, segmentStartPointId: string, position: Scene3DVector3 | null) => void
  onUpdatePoint?: (trajectoryId: string, pointId: string, position: Scene3DVector3) => void
  onTranslateTrajectory?: (trajectoryId: string, delta: Scene3DVector3) => void
  onContextMenu?: (trajectoryId: string, position: Scene3DVector3) => void
  onPointContextMenu?: (trajectoryId: string, pointId: string, position: Scene3DVector3) => void
}): JSX.Element {
  const points = React.useMemo(() => trajectoryLinePoints(trajectory), [trajectory])
  const segmentCount = trajectorySegmentCount(trajectory)
  const lineColor = active ? '#facc15' : trajectory.color
  const handleWholePointerDown = useTrajectoryWholeDrag({
    enabled: Boolean(wholeDraggable),
    trajectoryId: trajectory.id,
    onSelectTrajectory,
    onTranslateTrajectory,
  })
  const [hoveredEndpointId, setHoveredEndpointId] = React.useState<string | null>(null)
  const hideEndpointTimerRef = React.useRef<number | null>(null)

  const clearHideEndpointTimer = React.useCallback(() => {
    if (hideEndpointTimerRef.current === null) return
    window.clearTimeout(hideEndpointTimerRef.current)
    hideEndpointTimerRef.current = null
  }, [])

  const showEndpointButton = React.useCallback((pointId: string) => {
    clearHideEndpointTimer()
    setHoveredEndpointId(pointId)
  }, [clearHideEndpointTimer])

  const requestHideEndpointButton = React.useCallback(() => {
    clearHideEndpointTimer()
    hideEndpointTimerRef.current = window.setTimeout(() => {
      setHoveredEndpointId(null)
      hideEndpointTimerRef.current = null
    }, ENDPOINT_ADD_HIDE_DELAY_MS)
  }, [clearHideEndpointTimer])

  React.useEffect(() => () => {
    clearHideEndpointTimer()
  }, [clearHideEndpointTimer])

  return (
    <>
      {points.length >= 2 ? (
        <>
          <Line
            points={points}
            color={lineColor}
            lineWidth={active ? 3 : 2}
            transparent
            opacity={active ? 1 : 0.82}
            depthTest={false}
            renderOrder={1}
            onClick={(event) => {
              event.stopPropagation()
              onSelectTrajectory?.(trajectory.id)
            }}
            onPointerDown={wholeDraggable ? handleWholePointerDown : undefined}
            onContextMenu={(event) => {
              event.stopPropagation()
              event.nativeEvent.preventDefault()
              onContextMenu?.(trajectory.id, vectorToScene(event.point))
            }}
          />
          {!editable || wholeDraggable ? (
            <TrajectoryHitTube
              trajectory={trajectory}
              onWholePointerDown={wholeDraggable ? handleWholePointerDown : undefined}
              onContextMenu={onContextMenu}
              onSelectTrajectory={onSelectTrajectory}
            />
          ) : null}
        </>
      ) : null}
      {editable && active ? Array.from({ length: segmentCount }, (_, segmentIndex) => (
        <TrajectoryCurveControlHandle
          key={`${trajectory.id}:curve-control:${segmentIndex}`}
          trajectory={trajectory}
          segmentIndex={segmentIndex}
          visible={editable && active}
          onSelectTrajectory={onSelectTrajectory}
          onUpdateCurveControl={onUpdateCurveControl}
        />
      )) : null}
      {(editable || wholeDraggable) ? trajectory.points.map((point, pointIndex) => {
        const endpoint = editable && isTrajectoryEndpoint(trajectory, pointIndex)
        return (
          <React.Fragment key={point.id}>
            <TrajectoryControlPoint
              trajectory={trajectory}
              activePointId={activePointId}
              point={point}
              active={active}
              editable={editable}
              onPointerHover={endpoint ? () => showEndpointButton(point.id) : undefined}
              onPointerUnhover={endpoint ? requestHideEndpointButton : undefined}
              onSelectTrajectory={onSelectTrajectory}
              onSelectPoint={editable ? onSelectPoint : undefined}
              onWholePointerDown={wholeDraggable ? handleWholePointerDown : undefined}
              onContextMenu={onContextMenu}
              onPointContextMenu={onPointContextMenu}
              onUpdatePoint={onUpdatePoint}
            />
            <TrajectoryEndpointAddButton
              trajectory={trajectory}
              pointIndex={pointIndex}
              visible={endpoint && hoveredEndpointId === point.id}
              onKeepVisible={() => showEndpointButton(point.id)}
              onRequestHide={requestHideEndpointButton}
              onSelectTrajectory={onSelectTrajectory}
              onSelectPoint={onSelectPoint}
              onInsertPoint={onInsertPoint}
            />
          </React.Fragment>
        )
      }) : null}
    </>
  )
}

export function TrajectoryRenderer({
  trajectories,
  activeTrajectoryId,
  activePointId,
  editable,
  wholeDraggable,
  onSelectTrajectory,
  onSelectPoint,
  onCreateTrajectoryAt,
  onInsertPoint,
  onUpdateCurveControl,
  onUpdatePoint,
  onTranslateTrajectory,
  onEditTrajectory,
  onDeleteTrajectory,
  bindTargets = [],
  onBindTargetToTrajectory,
}: TrajectoryRendererProps): JSX.Element | null {
  const [contextMenu, setContextMenu] = React.useState<TrajectoryContextMenuState | null>(null)
  const [pointBindMenu, setPointBindMenu] = React.useState<TrajectoryPointBindMenuState | null>(null)
  const createTrajectoryFromBlank = React.useCallback((position: Scene3DVector3) => {
    onCreateTrajectoryAt?.(position)
  }, [onCreateTrajectoryAt])

  const contextMenuEnabled = Boolean(wholeDraggable && (onEditTrajectory || onDeleteTrajectory))
  const pointBindMenuEnabled = Boolean(editable && onBindTargetToTrajectory)

  const openContextMenu = React.useCallback((trajectoryId: string, position: Scene3DVector3) => {
    if (!contextMenuEnabled) return
    onSelectTrajectory?.(trajectoryId)
    setContextMenu({ trajectoryId, position })
  }, [contextMenuEnabled, onSelectTrajectory])

  const openPointBindMenu = React.useCallback((trajectoryId: string, pointId: string, position: Scene3DVector3) => {
    if (!pointBindMenuEnabled) return
    onSelectTrajectory?.(trajectoryId)
    onSelectPoint?.(trajectoryId, pointId)
    setPointBindMenu({ trajectoryId, pointId, position })
  }, [onSelectPoint, onSelectTrajectory, pointBindMenuEnabled])

  const closeContextMenu = React.useCallback(() => {
    setContextMenu(null)
  }, [])

  const closePointBindMenu = React.useCallback(() => {
    setPointBindMenu(null)
  }, [])

  React.useEffect(() => {
    if (contextMenu && (editable || !trajectories.some((trajectory) => trajectory.id === contextMenu.trajectoryId))) {
      setContextMenu(null)
    }
  }, [contextMenu, editable, trajectories])

  React.useEffect(() => {
    if (pointBindMenu && (!editable || !trajectories.some((trajectory) => (
      trajectory.id === pointBindMenu.trajectoryId &&
      trajectory.points.some((point) => point.id === pointBindMenu.pointId)
    )))) {
      setPointBindMenu(null)
    }
  }, [editable, pointBindMenu, trajectories])

  return (
    <group>
      {editable ? (
        <TrajectoryEditPlane
          onCreateTrajectory={createTrajectoryFromBlank}
        />
      ) : null}
      {trajectories.map((trajectory) => (
        <TrajectoryLineView
          key={trajectory.id}
          trajectory={trajectory}
          active={trajectory.id === activeTrajectoryId}
          activePointId={activePointId}
          editable={editable}
          wholeDraggable={wholeDraggable}
          onSelectTrajectory={onSelectTrajectory}
          onSelectPoint={onSelectPoint}
          onInsertPoint={onInsertPoint}
          onUpdateCurveControl={onUpdateCurveControl}
          onUpdatePoint={onUpdatePoint}
          onTranslateTrajectory={onTranslateTrajectory}
          onContextMenu={contextMenuEnabled ? openContextMenu : undefined}
          onPointContextMenu={pointBindMenuEnabled ? openPointBindMenu : undefined}
        />
      ))}
      {!editable && contextMenuEnabled ? (
        <TrajectoryContextMenu
          menu={contextMenu}
          onClose={closeContextMenu}
          onEditTrajectory={onEditTrajectory}
          onDeleteTrajectory={onDeleteTrajectory}
        />
      ) : null}
      {editable && pointBindMenuEnabled ? (
        <TrajectoryPointBindMenu
          menu={pointBindMenu}
          targets={bindTargets}
          onClose={closePointBindMenu}
          onBindTarget={onBindTargetToTrajectory}
        />
      ) : null}
    </group>
  )
}

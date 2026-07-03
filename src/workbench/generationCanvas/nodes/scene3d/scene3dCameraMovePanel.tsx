// 运镜预设面板：选中相机时挂在属性面板（scene3dInspector.PropertyPanel）相机段底部。
// 点按 = 按当前机位/拍摄目标就地落一段轨迹并追加到时间轴末尾（cameraMovePreset 纯函数），
// 连点即串联多段；落完仍可去轨迹模式逐点精修。样张：docs/design/mockups/scene3d-camera-directing-upgrade.html。
import React from 'react'
import { cn } from '../../../../utils/cn'
import { CAMERA_MOVES, CAMERA_MOVE_LABEL, ZOOM_MOVES, type CameraMove } from './cameraMoveVocab'
import {
  CAMERA_MOVE_AMPLITUDE_MAX,
  CAMERA_MOVE_AMPLITUDE_MIN,
  CAMERA_MOVE_DURATION_MAX,
  CAMERA_MOVE_DURATION_MIN,
  type CameraMovePresetSpec,
} from './cameraMovePreset'

const DEFAULT_DURATION = 5 // Seedance 甜区中档（与 CAMERA_SPEED_DURATION.medium 一致）
const DEFAULT_AMPLITUDE_PERCENT = 60

export function CameraMovePanel({
  readOnly,
  onApply,
  onExportFrames,
}: {
  readOnly: boolean
  onApply: (spec: CameraMovePresetSpec) => void
  /** 把该相机运镜段的首/尾帧各截一张落画布（接 Seedance 首尾帧工作流）。 */
  onExportFrames: () => void
}): JSX.Element {
  const [durationValue, setDurationValue] = React.useState(DEFAULT_DURATION)
  const [amplitudePercent, setAmplitudePercent] = React.useState(DEFAULT_AMPLITUDE_PERCENT)

  const applyMove = React.useCallback((move: CameraMove) => {
    onApply({
      move,
      duration: durationValue,
      amplitude: amplitudePercent / 100,
    })
  }, [amplitudePercent, durationValue, onApply])

  return (
    <div className="grid gap-2 rounded-nomi border border-[var(--nomi-line-soft)] bg-[var(--nomi-paper)] p-2">
      <div className="text-caption font-medium text-[var(--nomi-ink)]">运镜预设</div>
      <div className="grid grid-cols-2 gap-2">
        <label className="grid gap-1">
          <span className="text-micro text-[var(--nomi-ink-60)]">时长（秒）</span>
          <input
            className="h-8 min-w-0 rounded-nomi-sm border border-[var(--nomi-line)] bg-[var(--nomi-paper)] px-2 text-caption text-[var(--nomi-ink)] outline-none focus:border-[var(--nomi-accent)] disabled:opacity-50"
            disabled={readOnly}
            max={CAMERA_MOVE_DURATION_MAX}
            min={CAMERA_MOVE_DURATION_MIN}
            step={1}
            type="number"
            value={durationValue}
            onChange={(event) => setDurationValue(Number(event.currentTarget.value))}
          />
        </label>
        <label className="grid gap-1">
          <span className="text-micro text-[var(--nomi-ink-60)]">幅度（%）</span>
          <input
            className="h-8 min-w-0 rounded-nomi-sm border border-[var(--nomi-line)] bg-[var(--nomi-paper)] px-2 text-caption text-[var(--nomi-ink)] outline-none focus:border-[var(--nomi-accent)] disabled:opacity-50"
            disabled={readOnly}
            max={CAMERA_MOVE_AMPLITUDE_MAX * 100}
            min={CAMERA_MOVE_AMPLITUDE_MIN * 100}
            step={5}
            type="number"
            value={amplitudePercent}
            onChange={(event) => setAmplitudePercent(Number(event.currentTarget.value))}
          />
        </label>
      </div>
      <div className="grid grid-cols-3 gap-1.5">
        {CAMERA_MOVES.map((move) => (
          <button
            key={move}
            className={cn(
              'h-8 rounded-nomi-sm border border-[var(--nomi-line-soft)] bg-[var(--nomi-ink-05)] px-1 text-caption text-[var(--nomi-ink-60)] transition',
              'hover:bg-[var(--nomi-ink-10)] hover:text-[var(--nomi-ink)] disabled:cursor-not-allowed disabled:opacity-40',
              // 变焦族（FOV 参与动画）虚线描边示意，与样张一致。
              ZOOM_MOVES.has(move) && 'border-dashed border-[var(--nomi-ink-30)]',
              move === 'dolly_zoom' && 'col-span-3',
            )}
            disabled={readOnly}
            type="button"
            title={move === 'dolly_zoom' ? '机位后拉 + 变焦推，主体不变、背景抽离' : undefined}
            onClick={() => applyMove(move)}
          >
            {CAMERA_MOVE_LABEL[move]}
          </button>
        ))}
      </div>
      <button
        className={cn(
          'h-8 rounded-nomi-sm border border-[var(--nomi-line-soft)] bg-[var(--nomi-paper)] px-2 text-caption text-[var(--nomi-ink-60)] transition',
          'hover:bg-[var(--nomi-ink-05)] hover:text-[var(--nomi-ink)] disabled:cursor-not-allowed disabled:opacity-40',
        )}
        disabled={readOnly}
        type="button"
        title="按运镜段的起点/终点各截一张相机图落画布，可作首尾帧参考"
        onClick={onExportFrames}
      >
        导出运镜首尾帧
      </button>
      <div className="text-micro leading-4 text-[var(--nomi-ink-40)]">
        按当前机位与拍摄目标就地生成一段轨迹，追加到时间轴末尾；连点即串联多段，落段后可在轨迹模式里逐点精修。虚线三个是 FOV 参与动画的变焦运镜。
      </div>
    </div>
  )
}

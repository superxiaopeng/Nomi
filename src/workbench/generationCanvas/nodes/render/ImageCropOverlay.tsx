import React from 'react'
import { IconCheck, IconX } from '@tabler/icons-react'
import { cn } from '../../../../utils/cn'

export type CropRect = { x: number; y: number; w: number; h: number }

type DragMode = 'move' | 'nw' | 'ne' | 'sw' | 'se'

type ActiveDrag = {
  mode: DragMode
  pointerId: number
  startX: number
  startY: number
  boxWidth: number
  boxHeight: number
  startRect: CropRect
}

const MIN_CROP = 0.06

function clamp01(value: number): number {
  if (value < 0) return 0
  if (value > 1) return 1
  return value
}

/**
 * 非破坏式裁剪取景框：浮在图片节点的 preview 之上。
 * 仅负责「选区」交互；确认时把归一化矩形交回父级，由父级 canvas 裁出新节点（原图不动）。
 * 坐标约定：overlay 盒子 == 图片显示区（节点框 Part A 后恒等于图片比例，故无 letterbox）。
 */
export default function ImageCropOverlay({
  imageUrl,
  onConfirm,
  onCancel,
}: {
  imageUrl: string
  onConfirm: (rect: CropRect) => void
  onCancel: () => void
}): JSX.Element {
  const boxRef = React.useRef<HTMLDivElement>(null)
  const dragRef = React.useRef<ActiveDrag | null>(null)
  const [rect, setRect] = React.useState<CropRect>({ x: 0.1, y: 0.1, w: 0.8, h: 0.8 })

  const beginDrag = (mode: DragMode) => (event: React.PointerEvent) => {
    event.stopPropagation()
    event.preventDefault()
    const box = boxRef.current?.getBoundingClientRect()
    if (!box) return
    dragRef.current = {
      mode,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      boxWidth: box.width,
      boxHeight: box.height,
      startRect: rect,
    }
    ;(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
  }

  const handlePointerMove = (event: React.PointerEvent) => {
    const drag = dragRef.current
    if (!drag) return
    event.stopPropagation()
    const dx = (event.clientX - drag.startX) / Math.max(1, drag.boxWidth)
    const dy = (event.clientY - drag.startY) / Math.max(1, drag.boxHeight)
    const s = drag.startRect

    if (drag.mode === 'move') {
      const x = clamp01(Math.min(s.x + dx, 1 - s.w))
      const y = clamp01(Math.min(s.y + dy, 1 - s.h))
      setRect({ x: Math.max(0, x), y: Math.max(0, y), w: s.w, h: s.h })
      return
    }

    // corner resize: 锚定对角，移动当前角
    const right = s.x + s.w
    const bottom = s.y + s.h
    let nx = s.x
    let ny = s.y
    let nr = right
    let nb = bottom
    if (drag.mode === 'nw') { nx = clamp01(Math.min(s.x + dx, right - MIN_CROP)); ny = clamp01(Math.min(s.y + dy, bottom - MIN_CROP)) }
    if (drag.mode === 'ne') { nr = clamp01(Math.max(right + dx, s.x + MIN_CROP)); ny = clamp01(Math.min(s.y + dy, bottom - MIN_CROP)) }
    if (drag.mode === 'sw') { nx = clamp01(Math.min(s.x + dx, right - MIN_CROP)); nb = clamp01(Math.max(bottom + dy, s.y + MIN_CROP)) }
    if (drag.mode === 'se') { nr = clamp01(Math.max(right + dx, s.x + MIN_CROP)); nb = clamp01(Math.max(bottom + dy, s.y + MIN_CROP)) }
    setRect({ x: nx, y: ny, w: Math.max(MIN_CROP, nr - nx), h: Math.max(MIN_CROP, nb - ny) })
  }

  const endDrag = (event: React.PointerEvent) => {
    if (!dragRef.current) return
    event.stopPropagation()
    dragRef.current = null
  }

  const pct = (v: number) => `${v * 100}%`
  const handleClass = cn(
    'absolute w-3 h-3 -m-1.5 rounded-full bg-white border border-nomi-ink/30',
    'shadow-[0_1px_4px_rgba(18,24,38,0.3)]',
  )

  return (
    <div
      ref={boxRef}
      className="absolute inset-0 z-[14] select-none touch-none"
      onPointerDown={(event) => event.stopPropagation()}
      onPointerMove={handlePointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
    >
      <img src={imageUrl} alt="" className="w-full h-full object-fill pointer-events-none" draggable={false} />
      {/* 框外压暗：上/下/左/右四块 */}
      <div className="absolute left-0 right-0 top-0 bg-nomi-ink/[0.55] pointer-events-none" style={{ height: pct(rect.y) }} />
      <div className="absolute left-0 right-0 bottom-0 bg-nomi-ink/[0.55] pointer-events-none" style={{ height: pct(1 - rect.y - rect.h) }} />
      <div className="absolute left-0 bg-nomi-ink/[0.55] pointer-events-none" style={{ top: pct(rect.y), height: pct(rect.h), width: pct(rect.x) }} />
      <div className="absolute right-0 bg-nomi-ink/[0.55] pointer-events-none" style={{ top: pct(rect.y), height: pct(rect.h), width: pct(1 - rect.x - rect.w) }} />
      {/* 选区框 */}
      <div
        className="absolute border border-white/90 cursor-move"
        style={{ left: pct(rect.x), top: pct(rect.y), width: pct(rect.w), height: pct(rect.h) }}
        onPointerDown={beginDrag('move')}
      >
        <span className={cn(handleClass, 'left-0 top-0 cursor-nwse-resize')} onPointerDown={beginDrag('nw')} />
        <span className={cn(handleClass, 'right-0 top-0 cursor-nesw-resize')} onPointerDown={beginDrag('ne')} />
        <span className={cn(handleClass, 'left-0 bottom-0 cursor-nesw-resize')} onPointerDown={beginDrag('sw')} />
        <span className={cn(handleClass, 'right-0 bottom-0 cursor-nwse-resize')} onPointerDown={beginDrag('se')} />
      </div>
      {/* 确认 / 取消 */}
      <div className="absolute right-2 top-2 flex items-center gap-1.5">
        <button
          type="button"
          aria-label="取消裁剪"
          title="取消裁剪"
          className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-white/95 text-nomi-ink-80 shadow-nomi-md hover:bg-white"
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => { event.stopPropagation(); onCancel() }}
        >
          <IconX size={16} stroke={2} />
        </button>
        <button
          type="button"
          aria-label="确认裁剪"
          title="确认裁剪"
          className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-nomi-ink text-nomi-paper shadow-nomi-md hover:bg-nomi-accent"
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => { event.stopPropagation(); onConfirm(rect) }}
        >
          <IconCheck size={16} stroke={2} />
        </button>
      </div>
    </div>
  )
}

import React from 'react'
import { cn } from '../../utils/cn'
import { NomiAILabel, WorkbenchButton } from '../../design'
import { useWorkbenchStore } from '../workbenchStore'
import CreationAiPanel from '../creation/CreationAiPanel'
import CanvasAssistantPanel from '../generationCanvasV2/components/CanvasAssistantPanel'

/**
 * Single app-level assistant (C-2). One persistent dock whose body follows the
 * active workspace — creation → 文本工具, generation → 画布工具 — instead of two
 * separate per-workspace panels. Collapses to one launcher; preview has none.
 * Bottom-right anchored (doesn't cover the generation timeline), capped height,
 * left-edge drag handle to resize width. No free-floating window (R3 decision).
 */
export function WorkbenchAssistantDock(): JSX.Element | null {
  const workspaceMode = useWorkbenchStore((s) => s.workspaceMode)
  const collapsed = useWorkbenchStore((s) => s.assistantCollapsed)
  const setCollapsed = useWorkbenchStore((s) => s.setAssistantCollapsed)
  const width = useWorkbenchStore((s) => s.assistantWidth)
  const setWidth = useWorkbenchStore((s) => s.setAssistantWidth)

  const dragRef = React.useRef<{ startX: number; startW: number } | null>(null)
  const onPointerDown = React.useCallback((e: React.PointerEvent) => {
    dragRef.current = { startX: e.clientX, startW: width }
    e.currentTarget.setPointerCapture(e.pointerId)
  }, [width])
  const onPointerMove = React.useCallback((e: React.PointerEvent) => {
    const st = dragRef.current
    if (!st) return
    // Right-anchored: dragging left (smaller clientX) widens the dock.
    setWidth(st.startW + (st.startX - e.clientX))
  }, [setWidth])
  const endDrag = React.useCallback((e: React.PointerEvent) => {
    dragRef.current = null
    try { e.currentTarget.releasePointerCapture(e.pointerId) } catch { /* noop */ }
  }, [])

  // Preview/timeline has no assistant tools yet.
  if (workspaceMode === 'preview') return null

  const suffix = workspaceMode === 'creation' ? '创作' : '生成'

  if (collapsed) {
    return (
      <div className={cn('fixed right-4 bottom-4 z-[80]')}>
        <WorkbenchButton
          className={cn(
            'inline-flex items-center gap-2 h-9 pl-[10px] pr-[14px]',
            'border border-nomi-line rounded-full bg-nomi-paper text-nomi-ink',
            'text-[13px] font-medium shadow-nomi-md cursor-pointer',
            'hover:shadow-nomi-lg hover:-translate-y-px',
          )}
          onClick={() => setCollapsed(false)}
          aria-label="打开助手"
        >
          <NomiAILabel markSize={18} wordSize={13} suffix={suffix} />
        </WorkbenchButton>
      </div>
    )
  }

  return (
    <div
      className={cn(
        'fixed top-14 right-0 bottom-0 z-[80] flex',
        'overflow-hidden border-l border-nomi-line bg-nomi-paper shadow-nomi-lg',
      )}
      style={{ width }}
      aria-label="助手"
    >
      <div
        className={cn(
          'group absolute left-0 top-0 bottom-0 z-10 flex w-2 -translate-x-1/2',
          'cursor-col-resize items-center justify-center touch-none',
        )}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        role="separator"
        aria-label="拖动调整助手宽度"
        aria-orientation="vertical"
      >
        <span className={cn('h-9 w-[3px] rounded-full bg-nomi-ink-30 group-hover:bg-nomi-accent')} />
      </div>
      <div className={cn('h-full min-w-0 flex-1')}>
        {workspaceMode === 'creation' ? (
          <CreationAiPanel embedded onCollapse={() => setCollapsed(true)} />
        ) : (
          <CanvasAssistantPanel embedded onCollapse={() => setCollapsed(true)} />
        )}
      </div>
    </div>
  )
}

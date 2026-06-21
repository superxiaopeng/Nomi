import React from 'react'
import { cn } from '../../utils/cn'
import TimelinePanel from '../timeline/TimelinePanel'
import { useWorkbenchStore } from '../workbenchStore'

type GenerationWorkspaceProps = {
  canvas: React.ReactNode
  aiSidebar?: React.ReactNode
  aiLayout?: 'sidebar' | 'overlay'
}

export default function GenerationWorkspace({
  canvas,
  aiSidebar,
  aiLayout = 'sidebar',
}: GenerationWorkspaceProps): JSX.Element {
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
    // 右侧停靠：往左拖（clientX 变小）= 加宽。
    setWidth(st.startW + (st.startX - e.clientX))
  }, [setWidth])
  const endDrag = React.useCallback((e: React.PointerEvent) => {
    dragRef.current = null
    try { e.currentTarget.releasePointerCapture(e.pointerId) } catch { /* noop */ }
  }, [])
  const sidebarStyle = aiSidebar && aiLayout === 'sidebar'
    ? ({ gridTemplateColumns: `minmax(0,1fr) ${width}px` } as React.CSSProperties)
    : undefined
  return (
    <section
      className={cn(
        'workbench-generation',
        'grid grid-cols-[minmax(0,1fr)] grid-rows-[minmax(0,1fr)_var(--workbench-timeline-height)]',
        'w-full h-full overflow-hidden bg-[var(--workbench-bg)]',
        aiSidebar && aiLayout === 'overlay' && 'relative grid-cols-[minmax(0,1fr)]',
      )}
      style={sidebarStyle}
      data-has-ai={aiSidebar ? 'true' : 'false'}
      data-ai-layout={aiSidebar ? aiLayout : 'none'}
      aria-label="生成区"
    >
      <div className={cn(
        'workbench-generation__canvas',
        'min-w-0 min-h-0 overflow-hidden border-b border-[var(--workbench-border)]',
        'relative',
      )}>
        {canvas}
      </div>
      {aiSidebar ? (
        <aside className={cn(
          'workbench-generation__ai relative',
          'grid min-w-0 min-h-0 overflow-hidden border-b border-[var(--workbench-border)]',
          aiLayout === 'overlay'
            ? 'absolute top-4 right-4 z-[80] block w-auto h-auto border-0 bg-transparent pointer-events-auto'
            : 'border-l border-l-[var(--workbench-border)] bg-[var(--workbench-surface)]',
        )} aria-label="生成区 AI 侧栏">
          {/* 左缘拖手柄：仅停靠态显示。 */}
          {aiLayout === 'sidebar' ? (
            <div
              role="separator"
              aria-label="拖动调整助手宽度"
              aria-orientation="vertical"
              className={cn(
                'group absolute left-0 top-0 bottom-0 z-10 w-2 -translate-x-1/2',
                'flex cursor-col-resize items-center justify-center touch-none',
              )}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={endDrag}
              onPointerCancel={endDrag}
            >
              <span className={cn('h-8 w-[3px] rounded-full bg-nomi-ink-30 group-hover:bg-nomi-accent')} />
            </div>
          ) : null}
          {aiSidebar}
        </aside>
      ) : null}
      <div className={cn(
        'workbench-generation__timeline',
        'col-span-full min-w-0 min-h-0',
      )}>
        <TimelinePanel density="compact" regionLabel="生成时间轴" actionLabelPrefix="生成时间轴-" />
      </div>
    </section>
  )
}

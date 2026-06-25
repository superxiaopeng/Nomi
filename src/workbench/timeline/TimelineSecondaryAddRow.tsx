import React from 'react'
import { IconMusic, IconLetterCase } from '@tabler/icons-react'
import { useWorkbenchStore } from '../workbenchStore'
import { cn } from '../../utils/cn'
import { ASSET_LIBRARY_DRAG_MIME } from '../assets/assetLibraryDrag'
import { tryAddAudioAssetFromDragData } from './dropAudioAssetToTimeline'

/**
 * 叠加层收起窄条（方案 B）：配乐/字幕为空时不占整条副轨，收成这一条细行 + 「+ 配乐 / + 字幕」。
 * 「+ 配乐」开素材库(拖音频进音频轨)；「+ 字幕」在播放头加一条字幕(文字轨随即展开)。
 * 只在预览出现(showText)；生成画布底部时间轴只给配乐 chip。
 */
export function TimelineSecondaryAddRow({ showAudio, showText }: { showAudio: boolean; showText: boolean }): JSX.Element | null {
  const addTimelineTextClip = useWorkbenchStore((state) => state.addTimelineTextClip)
  const selectTimelineTextClip = useWorkbenchStore((state) => state.selectTimelineTextClip)
  const fps = useWorkbenchStore((state) => state.timeline.fps)
  const [dropHover, setDropHover] = React.useState(false)
  if (!showAudio && !showText) return null

  const addAudio = () => window.dispatchEvent(new CustomEvent('nomi-open-asset-library'))
  // 收起态下音频轨没有可投放的 lane → 让窄条本身收音频拖放（落到播放头处）。
  const onDrop = (event: React.DragEvent<HTMLDivElement>) => {
    setDropHover(false)
    if (!showAudio) return
    const playhead = useWorkbenchStore.getState().timeline.playheadFrame
    const result = tryAddAudioAssetFromDragData(event.dataTransfer.getData(ASSET_LIBRARY_DRAG_MIME), { fps, startFrame: playhead })
    if (result) event.preventDefault()
  }
  const acceptsAudio = (types: readonly string[]) => showAudio && types.includes(ASSET_LIBRARY_DRAG_MIME)
  const addText = () => {
    const playhead = useWorkbenchStore.getState().timeline.playheadFrame
    const id = addTimelineTextClip('caption', playhead)
    selectTimelineTextClip(id)
  }

  const chip = (key: string, label: string, color: string, icon: JSX.Element, onClick: () => void) => (
    <button
      key={key}
      type="button"
      onClick={onClick}
      className={cn(
        'inline-flex items-center gap-1 h-6 px-2.5 rounded-nomi-sm cursor-pointer bg-transparent',
        'border border-dashed text-micro font-medium leading-none',
        'transition-[background,border-color] duration-[var(--nomi-transition-fast)]',
      )}
      style={{ borderColor: `color-mix(in srgb, ${color} 50%, transparent)`, color }}
    >
      {icon}{label}
    </button>
  )

  return (
    <div
      className={cn(
        'workbench-timeline-secondary-add',
        'w-full min-h-[30px] grid grid-cols-[var(--workbench-timeline-label-width)_minmax(0,1fr)]',
        'items-center mb-1 border-b-0 rounded-[var(--nomi-radius-sm)]',
        dropHover && 'bg-[var(--workbench-accent-soft)]',
      )}
      data-testid="timeline-secondary-add"
      onDragEnter={(e) => { if (acceptsAudio(e.dataTransfer.types)) { e.preventDefault(); setDropHover(true) } }}
      onDragOver={(e) => { if (acceptsAudio(e.dataTransfer.types)) { e.preventDefault(); e.dataTransfer.dropEffect = 'copy' } }}
      onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as globalThis.Node | null)) setDropHover(false) }}
      onDrop={onDrop}
    >
      <span className={cn('sticky left-0 z-[3] min-w-0 pr-3 text-micro text-[var(--workbench-muted-soft)] truncate')}>叠加层</span>
      <div className={cn('flex items-center gap-2')}>
        {showAudio ? chip('audio', '配乐', 'var(--workbench-audio)', <IconMusic size={12} stroke={1.8} />, addAudio) : null}
        {showText ? chip('text', '字幕', 'var(--workbench-text)', <IconLetterCase size={12} stroke={1.8} />, addText) : null}
      </div>
    </div>
  )
}

import React from 'react'
import { cn } from '../../utils/cn'

// @ suggestion 下拉(样张 v4 态②.atPicker):列出当前可引用的 image 参考缩略图,选一个插入 chip。
// 键盘:↑↓←→ 移动、Enter 选、Esc 关(Esc 在扩展层处理)。空态:无参考时显「先加参考图」(规范 §4)。

export type MentionSuggestionItem = { url: string; index: number } // index = 在 referenceImageUrls 的位置(= character{N-1})

export type MentionSuggestionListRef = { onKeyDown: (args: { event: KeyboardEvent }) => boolean }

type Props = { items: MentionSuggestionItem[]; command: (item: MentionSuggestionItem) => void }

const AssetMentionSuggestionList = React.forwardRef<MentionSuggestionListRef, Props>(({ items, command }, ref) => {
  const [selected, setSelected] = React.useState(0)
  React.useEffect(() => { setSelected(0) }, [items])

  React.useImperativeHandle(ref, () => ({
    onKeyDown: ({ event }) => {
      if (!items.length) return false
      if (event.key === 'ArrowDown' || event.key === 'ArrowRight') { setSelected((s) => (s + 1) % items.length); return true }
      if (event.key === 'ArrowUp' || event.key === 'ArrowLeft') { setSelected((s) => (s - 1 + items.length) % items.length); return true }
      if (event.key === 'Enter') { const it = items[selected]; if (it) command(it); return true }
      return false
    },
  }), [items, selected, command])

  if (!items.length) {
    return (
      <div className={cn('inline-flex items-center px-[8px] h-[30px] rounded-nomi-sm border border-nomi-line bg-nomi-paper shadow-nomi-sm text-nomi-ink-40 text-micro')}>
        先加参考图
      </div>
    )
  }
  return (
    <div className={cn('inline-flex items-center gap-[6px] p-[6px] rounded-nomi-sm border border-nomi-line bg-nomi-paper shadow-nomi-sm')}>
      <span className={cn('text-nomi-ink-40 text-micro px-[2px]')}>放入哪张</span>
      {items.map((item, i) => (
        <button
          key={item.url}
          type="button"
          aria-label={`插入参考${item.index + 1}`}
          onMouseEnter={() => setSelected(i)}
          onClick={() => command(item)}
          className={cn(
            'relative w-[34px] h-[34px] rounded-nomi-sm overflow-hidden border border-nomi-line cursor-pointer',
            i === selected && 'outline outline-2 outline-offset-1 outline-nomi-accent',
          )}
        >
          <img src={item.url} alt="" draggable={false} className={cn('w-full h-full object-cover select-none')} />
          <span className={cn('absolute -top-[4px] -left-[4px] min-w-[15px] h-[15px] px-[3px] rounded-pill bg-nomi-accent text-nomi-paper text-micro font-semibold flex items-center justify-center leading-none')}>{item.index + 1}</span>
        </button>
      ))}
    </div>
  )
})
AssetMentionSuggestionList.displayName = 'AssetMentionSuggestionList'

export default AssetMentionSuggestionList

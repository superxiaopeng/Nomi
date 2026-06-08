import React from 'react'
import { IconChevronDown, IconTool } from '@tabler/icons-react'
import { cn } from '../../utils/cn'

/**
 * 样张「可用工具」折叠条：默认只一行不起眼的「N 个工具 ⌄」，点开列出工具 chip。
 * 不重要、不需一直看（样张设计）。两个面板（创作/生成）共用。token-only。
 */
export function AssistantToolsFold({ tools }: { tools: string[] }): JSX.Element | null {
  const [open, setOpen] = React.useState(false)
  if (tools.length === 0) return null
  return (
    <div className={cn('border-b border-nomi-line-soft bg-nomi-paper')}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={cn(
          'flex w-full items-center gap-1 px-3 py-1',
          'text-micro text-nomi-ink-40 hover:text-nomi-ink-60 cursor-pointer',
        )}
        aria-expanded={open}
        aria-label="可用工具"
      >
        <IconTool size={13} stroke={1.7} />
        {tools.length} 个工具
        <IconChevronDown size={11} className={cn('ml-0.5 transition-transform', open && 'rotate-180')} />
      </button>
      {open ? (
        <div className={cn('flex flex-wrap gap-1 px-3 pb-2')}>
          {tools.map((t) => (
            <span
              key={t}
              className={cn(
                'inline-flex items-center h-6 px-2 rounded-full',
                'border border-nomi-line bg-nomi-paper text-micro text-nomi-ink-80',
              )}
            >
              {t}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  )
}

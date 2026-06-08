import React from 'react'
import { cn } from '../../utils/cn'
import CreationAiPanel from './CreationAiPanel'
import WorkbenchEditor from './WorkbenchEditor'
import { NomiAILabel, WorkbenchButton } from '../../design'

export default function CreationWorkspace(): JSX.Element {
  // 与生成区助手一致：一开始收着（浮起一个 pill），点开才展开成 344px 侧栏。
  const [collapsed, setCollapsed] = React.useState(true)

  return (
    <section
      className={cn(
        'workbench-creation relative',
        'w-full h-full min-w-0 min-h-0',
        'pt-[22px] px-6 pb-6',
        'bg-workbench-bg',
        collapsed
          ? 'grid grid-cols-[minmax(0,900px)] justify-center'
          : cn(
              'grid grid-cols-[minmax(0,900px)_344px] justify-center gap-5',
              'max-[1120px]:grid-cols-[minmax(0,1fr)] max-[1120px]:grid-rows-[minmax(420px,1fr)_minmax(320px,42vh)]',
            ),
      )}
      aria-label="创作区"
    >
      <WorkbenchEditor />
      {collapsed ? (
        <WorkbenchButton
          className={cn(
            'absolute top-[22px] right-6 z-[20]',
            'inline-flex items-center gap-2 h-9 pl-[10px] pr-[14px]',
            'border border-nomi-line rounded-full bg-nomi-paper text-nomi-ink',
            'text-[13px] font-medium shadow-nomi-sm cursor-pointer',
            'hover:shadow-nomi-md hover:-translate-y-px',
          )}
          aria-label="展开创作助手"
          onClick={() => setCollapsed(false)}
        >
          <NomiAILabel markSize={18} wordSize={13} suffix="创作" />
        </WorkbenchButton>
      ) : (
        <CreationAiPanel onCollapse={() => setCollapsed(true)} />
      )}
    </section>
  )
}

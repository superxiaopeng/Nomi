import React from 'react'
import { cn } from '../../utils/cn'
import CreationAiPanel from './CreationAiPanel'
import WorkbenchEditor from './WorkbenchEditor'

export default function CreationWorkspace(): JSX.Element {
  return (
    <section
      className={cn(
        'workbench-creation',
        'grid grid-cols-[minmax(0,900px)_344px] justify-center gap-5',
        'w-full h-full min-w-0 min-h-0',
        'pt-[22px] px-6 pb-6',
        'bg-workbench-bg',
        'max-[1120px]:grid-cols-[minmax(0,1fr)] max-[1120px]:grid-rows-[minmax(420px,1fr)_minmax(320px,42vh)]',
      )}
      aria-label="创作区"
    >
      <WorkbenchEditor />
      <CreationAiPanel />
    </section>
  )
}

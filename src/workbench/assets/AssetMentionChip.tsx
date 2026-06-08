import React from 'react'
import { NodeViewWrapper, type NodeViewProps } from '@tiptap/react'
import { cn } from '../../utils/cn'

// @ 内联引用 chip 的 nodeview 组件:句中一个 18px 缩略图(样张 v4 .atChip)。
// 单独成文件,让 AssetMentionNode 只导出 Tiptap Node(非组件)——避免 react-refresh/only-export-components 警告。
export default function AssetMentionChip({ node }: NodeViewProps): JSX.Element {
  const url = String(node.attrs.url || '')
  return (
    <NodeViewWrapper
      as="span"
      data-asset-mention=""
      className={cn('inline-block align-[-3px] w-[18px] h-[18px] mx-[2px] rounded-nomi-sm border border-nomi-line overflow-hidden cursor-pointer hover:outline hover:outline-2 hover:outline-offset-1 hover:outline-nomi-accent')}
      contentEditable={false}
    >
      <img src={url} alt="参考" draggable={false} className={cn('w-full h-full object-cover select-none')} />
    </NodeViewWrapper>
  )
}

import React from 'react'
import { IconChevronDown, IconChevronUp, IconPhoto, IconTrash, IconTypography } from '@tabler/icons-react'
import { cn } from '../../../utils/cn'
import { NomiSelect } from '../../../design'
import { AutoGrowTextarea } from '../../ai/composer/AutoGrowTextarea'
import type { PlanAnchor, PlanAnchorKind } from '../../generationCanvas/agent/storyboardPlan'
import { ANCHOR_KIND_LABELS, ANCHOR_KINDS } from '../../generationCanvas/agent/storyboardPlanEdits'

/**
 * 锚卡（跨镜头要一致的）。v3 紧凑化（设计师+真实用户评审）：一行 = 类型 + **加粗名字（卡标题）**
 * + 单 carrier 胶囊 + 删除；描述**默认收成一行预览，点开才编辑**（渐进展开，让分镜浮上来）。
 * 浅底 ink-05=「配料」，与白底镜卡靠 surface 对比建层级，不堆边框。
 */

const KIND_OPTIONS = ANCHOR_KINDS.map((kind) => ({ value: kind, label: ANCHOR_KIND_LABELS[kind] }))

type Props = {
  anchor: PlanAnchor
  onUpdate: (patch: Partial<PlanAnchor>) => void
  onChangeKind: (kind: PlanAnchorKind) => void
  onRemove: () => void
  /** 视觉锚缺名字 → 校验高亮（名字是落画布的卡片标题）。 */
  nameInvalid?: boolean
}

export default function StoryboardAnchorCard({ anchor, onUpdate, onChangeKind, onRemove, nameInvalid }: Props): JSX.Element {
  // 空描述（新加的锚）默认展开好直接写；AI 填好的默认收起，让列表紧凑、分镜浮上来。
  const [expanded, setExpanded] = React.useState(() => !anchor.description.trim())

  return (
    <div className="bg-nomi-ink-05 rounded-nomi-sm p-2">
      <div className="flex items-center gap-2">
        <NomiSelect
          ariaLabel="锚类型"
          value={anchor.kind}
          options={KIND_OPTIONS}
          onChange={(value) => onChangeKind(value as PlanAnchorKind)}
        />
        <input
          value={anchor.name}
          onChange={(event) => onUpdate({ name: event.target.value })}
          placeholder="起个名字"
          aria-label="锚名字"
          className={cn(
            'w-44 h-7 px-2 rounded-nomi-sm border bg-nomi-paper',
            'text-bodySm font-medium text-nomi-ink outline-none focus:border-nomi-accent',
            nameInvalid ? 'border-workbench-danger' : 'border-nomi-line',
          )}
        />
        <span className="flex-1" />
        <CarrierPill value={anchor.carrier} onChange={(carrier) => onUpdate({ carrier })} />
        <button
          type="button"
          aria-label="删除锚"
          onClick={onRemove}
          className="size-7 grid place-items-center rounded-nomi-sm text-nomi-ink-40 hover:bg-nomi-ink-10 hover:text-nomi-ink-60"
        >
          <IconTrash size={15} stroke={1.6} />
        </button>
      </div>

      {expanded ? (
        <div className="mt-1.5">
          <AutoGrowTextarea
            value={anchor.description}
            onChange={(event) => onUpdate({ description: event.target.value })}
            aria-label="锚描述"
            autoFocus={!anchor.description.trim()}
            placeholder={anchor.carrier === 'visual' ? '外貌/服装/光线，给生成模型的参考描述' : '能用文字说清的特征（色调/品牌色/服装词），会拼进每个引用它的镜头'}
            className="px-2 py-2 rounded-nomi-sm bg-nomi-paper border border-transparent text-bodySm text-nomi-ink-60 leading-normal focus:border-nomi-accent"
          />
          <div className="flex justify-end mt-0.5">
            <button
              type="button"
              onClick={() => setExpanded(false)}
              className="text-micro text-nomi-ink-40 inline-flex items-center gap-1 hover:text-nomi-ink-60"
            >
              收起
              <IconChevronUp size={12} stroke={1.8} />
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          aria-label="展开描述"
          className="w-full flex items-center gap-1.5 mt-1.5 px-0.5 text-left"
        >
          <span className="flex-1 text-caption text-nomi-ink-40 truncate">{anchor.description.trim() || '添加描述…'}</span>
          <IconChevronDown size={13} stroke={1.8} className="text-nomi-ink-40 shrink-0" />
        </button>
      )}
    </div>
  )
}

/** carrier 单胶囊：显示当前态，点击切换（视觉锚 accent-soft / 文本锚描边）。 */
function CarrierPill({ value, onChange }: { value: PlanAnchor['carrier']; onChange: (v: PlanAnchor['carrier']) => void }): JSX.Element {
  const isVisual = value === 'visual'
  return (
    <button
      type="button"
      onClick={() => onChange(isVisual ? 'text' : 'visual')}
      title={isVisual ? '点切换为「仅提示词」' : '点切换为「生成参考图」'}
      className={cn(
        'h-6 px-2 rounded-full border text-caption inline-flex items-center gap-1 shrink-0',
        isVisual
          ? 'border-transparent bg-nomi-accent-soft text-nomi-accent'
          : 'border-nomi-line bg-nomi-paper text-nomi-ink-60 hover:text-nomi-ink-80',
      )}
    >
      {isVisual ? <IconPhoto size={12} stroke={1.8} /> : <IconTypography size={12} stroke={1.8} />}
      {isVisual ? '生成参考图' : '仅提示词'}
    </button>
  )
}

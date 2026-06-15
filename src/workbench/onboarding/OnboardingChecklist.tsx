/**
 * 上手 4 步清单（替代旧的三步 spotlight 引导 WorkbenchTour）。
 *
 * 原则：被动、克制、不压暗、不抢点击——常驻工作区右下角的可折叠小卡，
 * 四步随**真实行为**自动打勾，全部完成后整卡自动消失（密度优先 R2）。
 *   1 接入模型     = 有可用文本模型（hasTextModel）
 *   2 拆一个镜头   = 画布出现节点（canvas nodes 非空）
 *   3 生成一张     = 任一节点 status === 'success'
 *   4 导出成片     = 一次 MP4 导出成功（TimelinePreview 导出成功处 markChecklistStep）
 *
 * 打勾单调：一旦达成即写 localStorage（markChecklistStep），之后即使用户删节点也保持已勾。
 * 渲染在 WorkbenchShell 根内 fixed 定位（不 BodyPortal——portal 到 body 会丢
 * --nomi-* token 作用域）。
 *
 * 位置：bottom-right。生成区且节点 ≥6 时画布右下角有 minimap(180×120@bottom-6)，
 * 此时把清单上抬到 minimap 之上（bottom-40 = 160px，清掉 24+120 的占用带），不遮挡。
 */
import React from 'react'
import { IconCheck, IconChevronDown, IconListCheck } from '@tabler/icons-react'
import { cn } from '../../utils/cn'
import { useWorkbenchStore } from '../workbenchStore'
import { useGenerationCanvasStore } from '../generationCanvas/store/generationCanvasStore'
import { useHasTextModel } from '../library/useHasTextModel'
import { MINIMAP_MIN_NODES } from '../generationCanvas/components/CanvasMinimap'
import {
  type ChecklistStep,
  type ChecklistState,
  readChecklist,
  markChecklistStep,
  readChecklistCollapsed,
  writeChecklistCollapsed,
} from './onboardingState'

type StepMeta = { key: ChecklistStep; label: string; hint: string }

const STEPS: StepMeta[] = [
  { key: 'model', label: '接入模型', hint: '连一个 AI 服务（用你自己的 Key）。' },
  { key: 'storyboard', label: '拆一个镜头', hint: '在创作区说「拆成镜头」，铺成画布。' },
  { key: 'generated', label: '生成一张', hint: '在镜头卡里选模型，点「生成」出图。' },
  { key: 'exported', label: '导出成片', hint: '排进时间轴，右上「导出」输出 MP4。' },
]

const ALL_KEYS = STEPS.map((s) => s.key)

export function OnboardingChecklist(): JSX.Element | null {
  const workspaceMode = useWorkbenchStore((state) => state.workspaceMode)
  const nodes = useGenerationCanvasStore((state) => state.nodes)
  const { hasTextModel: textModelReady } = useHasTextModel()

  // 真实行为派生（live）：达成即往持久层写一次，render 用 persisted||live 立刻反映。
  const live = React.useMemo<ChecklistState>(
    () => ({
      model: textModelReady === true,
      storyboard: nodes.length > 0,
      generated: nodes.some((node) => node.status === 'success'),
      exported: false, // 导出无 live 派生源（fire-and-forget），只走 TimelinePreview 的持久标记
    }),
    [textModelReady, nodes],
  )

  const [persisted, setPersisted] = React.useState<ChecklistState>(() => readChecklist())
  const [collapsed, setCollapsed] = React.useState<boolean>(() => readChecklistCollapsed())

  // live 新达成 → 落盘 + 刷新本地态。导出标记由别处写盘，靠 storage 事件 + 焦点回读同步。
  React.useEffect(() => {
    let changed = false
    for (const key of ALL_KEYS) {
      if (live[key] && !persisted[key]) {
        markChecklistStep(key)
        changed = true
      }
    }
    if (changed) setPersisted(readChecklist())
  }, [live, persisted])

  // 跨组件写盘（如导出成功 markChecklistStep('exported')）回读：storage 事件 + 窗口聚焦。
  React.useEffect(() => {
    const sync = () => setPersisted(readChecklist())
    window.addEventListener('storage', sync)
    window.addEventListener('focus', sync)
    return () => {
      window.removeEventListener('storage', sync)
      window.removeEventListener('focus', sync)
    }
  }, [])

  const effective = React.useMemo<ChecklistState>(
    () => ({
      model: persisted.model || live.model,
      storyboard: persisted.storyboard || live.storyboard,
      generated: persisted.generated || live.generated,
      exported: persisted.exported || live.exported,
    }),
    [persisted, live],
  )

  const doneCount = ALL_KEYS.filter((key) => effective[key]).length
  const allDone = doneCount === ALL_KEYS.length
  const nextKey = STEPS.find((s) => !effective[s.key])?.key ?? null

  const toggleCollapsed = React.useCallback(() => {
    setCollapsed((prev) => {
      const next = !prev
      writeChecklistCollapsed(next)
      return next
    })
  }, [])

  if (allDone) return null

  // 生成区 minimap 占右下角（≥MINIMAP_MIN_NODES 节点时）→ 把清单抬到它之上，避遮挡。
  const minimapPresent = workspaceMode === 'generation' && nodes.length >= MINIMAP_MIN_NODES
  const anchor = cn('fixed right-5 z-[40]', minimapPresent ? 'bottom-40' : 'bottom-5')

  if (collapsed) {
    return (
      <button
        type="button"
        onClick={toggleCollapsed}
        data-onboarding-checklist="collapsed"
        aria-label={`上手 4 步，已完成 ${doneCount} / ${ALL_KEYS.length}`}
        className={cn(
          anchor,
          'inline-flex items-center gap-2 h-8 px-2.5 cursor-pointer font-inherit',
          'rounded-full border border-nomi-line bg-nomi-paper shadow-nomi-sm',
          'text-body-sm text-nomi-ink-80 transition-colors hover:border-nomi-ink-20',
        )}
      >
        <IconListCheck size={15} stroke={1.6} className="text-nomi-ink-60" aria-hidden="true" />
        上手 4 步
        <span className="inline-flex items-center px-1.5 py-0.5 rounded-full bg-nomi-accent-soft text-nomi-accent text-micro font-semibold tabular-nums">
          {doneCount}/{ALL_KEYS.length}
        </span>
      </button>
    )
  }

  return (
    <section
      data-onboarding-checklist="expanded"
      aria-label="上手 4 步"
      className={cn(
        anchor,
        'w-[258px] overflow-hidden',
        'rounded-nomi border border-nomi-line bg-nomi-paper shadow-nomi-md',
      )}
    >
      <header className="flex items-center gap-2 pl-4 pr-2 pt-3 pb-2">
        <span className="text-body font-semibold text-nomi-ink">上手 4 步</span>
        <span className="text-caption font-medium text-nomi-ink-40 tabular-nums">
          {doneCount} / {ALL_KEYS.length}
        </span>
        <button
          type="button"
          onClick={toggleCollapsed}
          aria-label="收起"
          className={cn(
            'ml-auto grid place-items-center size-6 rounded-nomi-sm border-0 bg-transparent cursor-pointer',
            'text-nomi-ink-40 transition-colors hover:bg-nomi-ink-10 hover:text-nomi-ink',
          )}
        >
          <IconChevronDown size={16} stroke={1.8} aria-hidden="true" />
        </button>
      </header>

      <div className="h-1 mx-4 mb-2 rounded-full bg-nomi-ink-10 overflow-hidden">
        <div
          className="h-full rounded-full bg-nomi-accent transition-[width] duration-[var(--nomi-transition-fast)]"
          style={{ width: `${(doneCount / ALL_KEYS.length) * 100}%` }}
        />
      </div>

      <ul className="flex flex-col px-1.5 pb-2 m-0 list-none">
        {STEPS.map((step) => {
          const done = effective[step.key]
          const isNext = !done && step.key === nextKey
          return (
            <li
              key={step.key}
              data-step={step.key}
              data-done={done ? 'true' : 'false'}
              className={cn(
                'flex items-start gap-2.5 p-2 rounded-nomi-sm',
                isNext ? 'bg-nomi-accent-soft' : '',
              )}
            >
              <span
                className={cn(
                  'shrink-0 grid place-items-center size-5 rounded-full mt-px',
                  done
                    ? 'bg-nomi-accent text-nomi-paper'
                    : isNext
                      ? 'border-2 border-nomi-accent'
                      : 'border-2 border-nomi-ink-20',
                )}
              >
                {done ? <IconCheck size={12} stroke={3} aria-hidden="true" /> : null}
              </span>
              <span className="min-w-0">
                <span
                  className={cn(
                    'block text-body-sm font-medium leading-snug',
                    done ? 'text-nomi-ink-40' : isNext ? 'text-nomi-accent' : 'text-nomi-ink',
                  )}
                >
                  {step.label}
                </span>
                {!done ? (
                  <span className="block text-caption text-nomi-ink-40 leading-snug mt-px">{step.hint}</span>
                ) : null}
              </span>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

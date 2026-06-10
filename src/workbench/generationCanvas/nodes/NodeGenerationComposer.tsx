import React from 'react'
import type { Editor } from '@tiptap/react'
import { cn } from '../../../utils/cn'
import PromptEditor from '../../assets/PromptEditor'
import { readArchetypeArray } from './controls/archetypeMeta'
import type { GenerationCanvasNode } from '../model/generationCanvasTypes'
import { useGenerationCanvasStore } from '../store/generationCanvasStore'
import { canRunGenerationNode, rerunGenerationNodeAsNewNode, runGenerationNode } from '../runner/generationRunController'
import NodeParameterControls from './NodeParameterControls'
import { useNodeAssetDrop } from './useNodeAssetDrop'
import { persistActiveWorkbenchProjectNow } from '../../project/workbenchProjectSession'
import {
  getGenerationNodeExecutionKind,
  getGenerationNodePromptPlaceholder,
  isImageLikeGenerationNodeKind,
  isVideoLikeGenerationNodeKind,
} from '../model/generationNodeKinds'
import { getTextGenMode, type TextGenMode } from '../runner/textActions'

// C5 P2：文本节点的三种生成模式。
const TEXT_GEN_MODES: { value: TextGenMode; label: string }[] = [
  { value: 'append', label: '续写' },
  { value: 'rewrite', label: '改写' },
  { value: 'replace', label: '重写' },
]
const TEXT_MODE_PLACEHOLDER: Record<TextGenMode, string> = {
  append: '续写要求…（留空＝直接接着往下写）',
  rewrite: '改写要求…（先在正文里选中要改的文字）',
  replace: '重写要求…（替换整篇）',
}

// 生成节点的浮动 composer：references + 提示词 + 参数 + 生成/重新生成按钮。
// 从 BaseGenerationNode 抽出（A1.5 接缝）：只有「生成类」节点挂它，素材节点不挂。
// 所有生成相关依赖（runner / NodeParameterControls / 布局计算）都收在这里，壳保持 kind 无关。

type Props = {
  node: GenerationCanvasNode
  visualSize: { width: number; height: number }
}

type FloatingComposerLayout = {
  maxHeight: number
  gap: number
}

function floatingComposerLayout(width: number, _height: number, kind: GenerationCanvasNode['kind']): FloatingComposerLayout {
  // 宽度不再在这里算——它**内容驱动**（CSS `w-fit` + `min-w/max-w` 边界，见卡 className），
  // 跟着该模型实际的参数横排自然撑开，参数少则窄、多则宽、触上限在卡内换行（绝不绑节点比例、不钉死常数）。
  //
  // 高度同理**内容驱动**，不再绑节点高（旧 `height*0.72` 是 bug 根因：小节点 → 矮卡，
  // 「参考区 + 3 行提示词 + 底栏」放不下，overflow-hidden 把底栏的生成钮裁到卡外，修③④）。
  // 卡片在 flex-col 里自然按内容长高；只有一个可伸缩区（提示词 flex-1 overflow-auto），
  // 底栏 shrink-0 永远贴底可见。这里给一个宽松上限：内容超过它时只有提示词内部滚动，底栏不动。
  const maxHeight = kind === 'video' ? 460 : 400
  const gap = width >= 420 ? 14 : 10
  return { maxHeight, gap }
}

export default function NodeGenerationComposer({ node, visualSize }: Props): JSX.Element {
  const updateNode = useGenerationCanvasStore((state) => state.updateNode)
  const status = node.status || 'idle'
  const isGenerating = status === 'queued' || status === 'running'
  const hasResult = Boolean(node.result?.url)
  const nodeExecutionKind = getGenerationNodeExecutionKind(node.kind)
  // v0.7.2 perf: 用 boolean primitive 订阅 canGenerate
  const canGenerate = useGenerationCanvasStore((state) =>
    canRunGenerationNode(node, { nodes: state.nodes, edges: state.edges }),
  ) && !isGenerating
  const composerLayout = floatingComposerLayout(visualSize.width, visualSize.height, node.kind)
  const isTextKind = node.kind === 'text'
  const textGenMode = getTextGenMode(node)
  // 持有 prompt 编辑器实例,供「点参考 tile → 在光标处插入 chip」(@ 内联引用主路径)。
  const [promptEditor, setPromptEditor] = React.useState<Editor | null>(null)
  const insertMention = React.useCallback((url: string) => {
    if (promptEditor && !promptEditor.isDestroyed) promptEditor.commands.insertAssetMention(url)
  }, [promptEditor])
  // 拖文件到卡 → 加为参考（捷径 A）。仅当当前模式有数组参考槽时接管拖拽。
  const { acceptsDrop, isDragOver, isUploading, dropHandlers } = useNodeAssetDrop(node)

  const handleGenerate = async (event: React.MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation()
    const state = useGenerationCanvasStore.getState()
    if (!canRunGenerationNode(node, { nodes: state.nodes, edges: state.edges })) return
    try {
      if (hasResult) {
        await rerunGenerationNodeAsNewNode(node.id)
      } else {
        await runGenerationNode(node.id)
      }
    } catch {
      // runGenerationNode records the explicit failure on the node; the card renders it below the prompt.
    }
  }

  // 卡宽 = 底栏「参数行」的真实一行宽度（实测）。确定宽度下 tile/提示词/参数都正常布局——不写死常数。
  // ⚠ 关键：footerRef 必须是 `w-max`（width:max-content）的元素，盒子尺寸 = 内容宽、**与卡宽脱钩**。
  // 否则 footer 作为 flex-col 子项会被拉伸到卡宽，scrollWidth 反读回卡宽 → 成环：任何一次过宽测量
  // 都会变成稳定不动点、再也缩不回来（曾导致「2 个参数的卡却有大片右侧空白」）。w-max 只裹底栏的
  // 参数 pill + 生成钮，不含 AssetReference tile（那在上方 references 区），所以不会压塌 tile。
  const footerRef = React.useRef<HTMLDivElement>(null)
  const [cardWidth, setCardWidth] = React.useState<number | undefined>(undefined)
  React.useLayoutEffect(() => {
    const el = footerRef.current
    if (!el) return
    // w-max 下 scrollWidth = 底栏(模型芯片 + 参数 flex-nowrap + 生成钮)真实一行内容宽，不随卡宽变。
    // 切模型/改参数 → 内容变 → w-max 盒子变 → ResizeObserver 触发重测（也靠 node.meta 依赖同步重跑）。
    // 要多宽给多宽（不设上限、不换行）；下限 360 保证提示词可写。+24 = 卡左右 padding。
    const measure = () => setCardWidth(Math.max(360, el.scrollWidth + 24))
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [node.meta])

  return (
    // 外层只做定位锚（不裁剪），宽度跟随内层卡（w-fit 包住确定宽度的卡，便于 -translate-x-1/2 居中）。
    <div
      className={cn('generation-canvas-v2-node__composer', 'absolute left-1/2 z-[8] -translate-x-1/2 w-fit')}
      style={{ top: `calc(100% + ${composerLayout.gap}px)` }}
      onPointerDown={(event) => event.stopPropagation()}
      {...(acceptsDrop ? dropHandlers : {})}
    >
      <div
        className={cn(
          'generation-canvas-v2-node__composer-card',
          'flex flex-col gap-[11px] p-[12px] min-h-[150px] min-w-[360px]',
          // 宽度由 cardWidth（实测参数行宽度）确定 → 参数横排一行全显示、要多宽给多宽，且 tile/提示词不塌不爆。
          'border border-nomi-line rounded-nomi bg-nomi-paper overflow-hidden shadow-nomi-md',
          'transition-[outline-color] duration-150',
          isDragOver && 'outline-2 outline-dashed outline-nomi-accent outline-offset-[-2px]',
        )}
        style={{ maxHeight: composerLayout.maxHeight, ...(cardWidth ? { width: cardWidth } : {}) }}
      >
      {isImageLikeGenerationNodeKind(node.kind) || isVideoLikeGenerationNodeKind(node.kind) ? (
        <>
          <NodeParameterControls node={node} section="references" onInsertMention={insertMention} />
          {/* 样张 v4 .divider：参考区与描述之间一条极淡分隔线 */}
          <div className={cn('h-px bg-nomi-line-soft')} />
        </>
      ) : null}
      {isTextKind ? (
        <div className={cn('flex items-center gap-1')} role="group" aria-label="生成模式">
          {TEXT_GEN_MODES.map((option) => (
            <button
              key={option.value}
              type="button"
              data-active={textGenMode === option.value ? 'true' : 'false'}
              onClick={(event) => {
                event.stopPropagation()
                updateNode(node.id, { meta: { ...(node.meta || {}), textGenMode: option.value } })
              }}
              className={cn(
                'h-[22px] rounded-full px-2.5 text-[11px] font-medium',
                'text-nomi-ink-60 hover:bg-nomi-ink-05',
                'data-[active=true]:bg-nomi-accent-soft data-[active=true]:text-nomi-accent',
              )}
            >
              {option.label}
            </button>
          ))}
        </div>
      ) : null}
      {/* 长 prompt 在编辑器内部滚动/换行；底栏永远贴底（卡宽确定，提示词在卡宽内自然换行，不撑爆）。 */}
      {/* 提示词至少 3 行高（min-h-[72px]）——参考区/底栏再多也不把它挤成 1 行（修③）；超长时本区滚动。 */}
      <div className={cn('flex-1 min-h-[72px] overflow-auto')}>
        <PromptEditor
          className={cn('min-h-[72px]')}
          value={node.prompt || ''}
          placeholder={isTextKind ? TEXT_MODE_PLACEHOLDER[textGenMode] : getGenerationNodePromptPlaceholder(node.kind)}
          onChange={(next) => updateNode(node.id, { prompt: next })}
          onBlur={() => { void persistActiveWorkbenchProjectNow().catch(() => {}) }}
          onReady={setPromptEditor}
          mentionCandidates={readArchetypeArray(node.meta || {}, 'referenceImageUrls')}
        />
      </div>
      <div ref={footerRef} className={cn('flex items-center gap-2 mt-auto pt-1 shrink-0 w-max')}>
        <NodeParameterControls node={node} section="parameters" />
        {(() => {
          const disabledReason = !canGenerate && !isGenerating
            ? nodeExecutionKind === 'video'
              ? acceptsDrop
                ? '需要先添加参考素材（拖入 / 连线 / 点 +）'
                : '需要先连接一个图片节点作为首帧'
              : nodeExecutionKind === 'image'
                ? undefined
                : `「${node.kind}」类型暂不支持直接生成`
            : undefined
          const title = disabledReason ?? (isGenerating ? '生成中…' : hasResult ? '重新生成' : '生成')
          return (
            <span title={title} style={{ display: 'contents' }}>
              {/* 原生 button：避开 WorkbenchButton(Mantine)对 radius/bg 的覆盖,确保样张 v4 的深色圆形主行动钮 */}
              <button
                type="button"
                className={cn(
                  'inline-flex items-center justify-center shrink-0 w-[30px] h-[30px] p-0',
                  'border-0 rounded-full bg-nomi-ink text-nomi-paper text-[14px] leading-none cursor-pointer',
                  'transition-colors hover:enabled:bg-nomi-accent',
                  'disabled:bg-nomi-ink-20 disabled:text-nomi-ink-40 disabled:cursor-not-allowed',
                )}
                aria-label={hasResult ? '重新生成' : '生成素材'}
                disabled={!canGenerate}
                onClick={handleGenerate}
              >
                {isGenerating ? '···' : '↑'}
              </button>
            </span>
          )
        })()}
      </div>
      </div>
      {isDragOver ? (
        <div
          className={cn(
            'generation-canvas-v2-node__composer-dropzone',
            'absolute inset-0 z-[10] flex items-center justify-center rounded-nomi',
            'bg-nomi-paper/[0.7] pointer-events-none',
          )}
          aria-hidden="true"
        >
          <span className={cn('text-caption text-nomi-ink-60')}>{isUploading ? '上传中…' : '松手添加为参考'}</span>
        </div>
      ) : null}
    </div>
  )
}

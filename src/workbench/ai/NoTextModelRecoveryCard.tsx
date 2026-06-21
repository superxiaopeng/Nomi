// 「创作助手缺文本大脑」恢复卡（Issue #9 Part B）：替掉死胡同英文串
// 「No local text model is configured」——后者只是一句报错、用户不知道怎么办。
//
// 触发：agent 报错且 catalog 里没有任何 enabled 的 text 模型（CreationAiPanel 用
// useHasTextModel 判定，传 show=true 才渲染）。判的是**真实目录状态**而非匹配错误字符串（P2）。
//
// 一键启用是**派生**的，不 hardcode 任何模型描述符（单一真相源在种子 apimartTexts.ts，P1）：
// 找一个「供应商已配 key 但被禁用」的文本模型 → 一键启用它（读它自己的 labelZh）。
// 找不到（只接了纯生成供应商）→ 只给「去模型设置」。Part A 已保证接 APIMart 即自动有大脑，
// 故本卡是兜底安全网，常态下因 hasTextModel=true 根本不出现。
import React from 'react'
import { IconBulb, IconCheck, IconSettings } from '@tabler/icons-react'
import { cn } from '../../utils/cn'
import { WorkbenchButton } from '../../design'
import { NomiIdentityRow } from './AssistantMessageView'
import {
  listWorkbenchModelCatalogModels,
  listWorkbenchModelCatalogVendors,
  upsertWorkbenchModelCatalogModel,
} from '../api/modelCatalogApi'

type Recoverable = { vendorKey: string; modelKey: string; labelZh: string }
type CardState = 'prompt' | 'enabling' | 'done'

/** 找一个「供应商已配 key、但被禁用」的文本模型（可一键启用的大脑）。无则返回 null。 */
async function findRecoverableBrain(): Promise<Recoverable | null> {
  try {
    const [disabledTexts, vendors] = await Promise.all([
      listWorkbenchModelCatalogModels({ kind: 'text', enabled: false }),
      listWorkbenchModelCatalogVendors(),
    ])
    const keyed = new Set(vendors.filter((v) => v.hasApiKey).map((v) => v.key))
    const hit = disabledTexts.find((m) => keyed.has(m.vendorKey))
    return hit ? { vendorKey: hit.vendorKey, modelKey: hit.modelKey, labelZh: hit.labelZh } : null
  } catch {
    return null
  }
}

export function NoTextModelRecoveryCard({ onResolved }: { onResolved?: () => void }): JSX.Element {
  const [state, setState] = React.useState<CardState>('prompt')
  const [recoverable, setRecoverable] = React.useState<Recoverable | null>(null)

  React.useEffect(() => {
    let alive = true
    void findRecoverableBrain().then((r) => { if (alive) setRecoverable(r) })
    return () => { alive = false }
  }, [])

  const openSettings = React.useCallback(() => {
    window.dispatchEvent(new CustomEvent('nomi-open-model-catalog'))
  }, [])

  const enableBrain = React.useCallback(async () => {
    if (!recoverable) return
    setState('enabling')
    try {
      await upsertWorkbenchModelCatalogModel({ ...recoverable, kind: 'text', enabled: true })
      window.dispatchEvent(new CustomEvent('nomi-model-catalog-changed'))
      setState('done')
      onResolved?.()
    } catch {
      setState('prompt')
    }
  }, [recoverable, onResolved])

  return (
    <div className={cn('self-start w-full max-w-full')} data-role="assistant" data-recovery="no-text-model">
      <NomiIdentityRow />
      {state === 'done' ? (
        <div className={cn('flex items-start gap-2 p-3 rounded-nomi border border-nomi-line bg-nomi-ink-05')}>
          <IconCheck size={16} className={cn('mt-0.5 shrink-0 text-nomi-ink-80')} />
          <div className={cn('flex flex-col gap-1')}>
            <span className={cn('text-body-sm font-medium text-nomi-ink')}>大脑已就位</span>
            <span className={cn('text-caption text-nomi-ink-60 leading-snug')}>
              「模型设置」里多了一行「文本」。现在可以拆镜头、对话了——再发一次试试。
            </span>
          </div>
        </div>
      ) : (
        <div className={cn('flex flex-col gap-3 p-3 rounded-nomi border border-nomi-line')}>
          <div className={cn('flex items-start gap-2')}>
            <IconBulb size={18} className={cn('mt-0.5 shrink-0 text-nomi-ink-60')} />
            <div className={cn('flex flex-col gap-1')}>
              <span className={cn('text-body-sm font-medium text-nomi-ink leading-snug')}>创作助手还缺一个文本大脑</span>
              <span className={cn('text-caption text-nomi-ink-60 leading-snug')}>
                你接的是图片 / 视频生成模型，负责出画面。拆镜头、对话、写文案需要一个
                <span className={cn('text-nomi-ink')}>文本对话模型</span>当大脑。
              </span>
            </div>
          </div>
          <div className={cn('flex flex-col gap-2')}>
            {recoverable ? (
              <WorkbenchButton
                variant="primary"
                className="w-full"
                loading={state === 'enabling'}
                onClick={() => void enableBrain()}
              >
                <IconBulb />
                <span className="min-w-0 truncate">启用 {recoverable.labelZh}</span>
              </WorkbenchButton>
            ) : null}
            <WorkbenchButton variant="default" className="w-full" onClick={openSettings}>
              <IconSettings />
              去模型设置
            </WorkbenchButton>
          </div>
        </div>
      )}
    </div>
  )
}

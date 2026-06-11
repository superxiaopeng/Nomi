// 批量执行计划预览态(harness S2b,样张方案 A:画布原位确认)。
// 语义铁律:进入预览 ≠ 开始生成——确认前零 vendor 调用零扣费;取消即散,画布零变化。
import { create } from 'zustand'
import { toast } from '../../../ui/toast'
import { runGenerationNodesByPlan } from '../runner/generationRunController'
import type { DependencyWavePlan } from '../runner/dependencyWaves'

type BatchPlanPreviewState = {
  plan: DependencyWavePlan | null
  running: boolean
  open: (plan: DependencyWavePlan) => void
  cancel: () => void
  confirm: () => Promise<void>
}

export const useBatchPlanPreviewStore = create<BatchPlanPreviewState>()((set, get) => ({
  plan: null,
  running: false,
  open: (plan) => set({ plan, running: false }),
  cancel: () => set({ plan: null, running: false }),
  confirm: async () => {
    const { plan, running } = get()
    if (!plan || running) return
    set({ running: true })
    const total = plan.waves.flat().length + plan.blocked.length
    toast(`按计划开始生成 ${total} 个节点(${plan.waves.length} 波)…`, 'info')
    set({ plan: null, running: false })
    try {
      const result = await runGenerationNodesByPlan(plan)
      const okCount = result.successes.length
      const failCount = result.failures.length
      if (failCount === 0) toast(`已完成 ${okCount}/${total} 个节点的生成`, 'success')
      else if (okCount === 0) toast(`批量生成失败：${failCount}/${total} 个节点未完成`, 'error')
      else toast(`已完成 ${okCount}/${total}，${failCount} 个失败 — 在画布上单独重试`, 'info')
    } catch (error: unknown) {
      toast(error instanceof Error && error.message ? error.message : '批量生成异常', 'error')
    }
  },
}))

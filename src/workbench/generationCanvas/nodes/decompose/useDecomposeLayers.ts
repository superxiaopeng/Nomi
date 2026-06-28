// 「元素拆解」交互编排（从工具条抽出，别喂巨壳 R9）。
// 付费确认 → 调 decompose IPC 拿 N 张远端图层 → 逐张落地成 nomi-local（同 removeBackground）→
// 组装白板态。工具条据 decomposeState 打开 WhiteboardModal(sourceKind:'image')，关闭时白板现成的
// 「截图合成回主图」完成闭环。
import React from 'react'
import type { GenerationCanvasNode } from '../../model/generationCanvasTypes'
import type { WhiteboardState } from '../whiteboard/whiteboardTypes'
import { inferWhiteboardAspectRatio } from '../whiteboard/whiteboardState'
import { buildLayerWhiteboardState } from './buildLayerWhiteboard'
import { confirmAndMintGrant, describeGenerationCost } from '../../spend/spendConfirm'
import { getDesktopBridge } from '../../../../desktop/bridge'
import { getDesktopActiveProjectId } from '../../../../desktop/activeProject'
import { listWorkbenchModelCatalogVendors } from '../../../api/modelCatalogApi'
import { confirmDialog } from '../../../../design/confirmDialogStore'
import { toast } from '../../../../ui/toast'

/**
 * 没接 Replicate 时不甩死胡同错误，而是引导去「模型接入」（那里已有 Replicate 卡：官网链接 +
 * 「登录 Replicate → Account → API tokens 拿 r8_ token」提示）。返回 true=已接入可继续。
 */
async function ensureReplicateConnectedOrGuide(): Promise<boolean> {
  const vendors = await listWorkbenchModelCatalogVendors().catch(() => [])
  const replicate = vendors.find((v) => v.key === 'replicate')
  if (replicate?.enabled && replicate.hasApiKey) return true
  const go = await confirmDialog({
    title: '拆解元素需要先接入 Replicate',
    message:
      '元素拆解用开源模型 qwen-image-layered（Replicate 托管，约 $0.05/张，按量付费）。\n去「模型接入」填入 Replicate API Token 即可使用——登录 replicate.com → Account → API tokens 获取（r8_ 开头），凭证本地加密存储。',
    confirmLabel: '去接入',
    cancelLabel: '以后再说',
  })
  if (go) window.dispatchEvent(new CustomEvent('nomi-open-model-catalog'))
  return false
}

const DECOMPOSE_LAYERS = 6

export type DecomposeLayersController = {
  decomposeBusy: boolean
  decomposeState: WhiteboardState | null
  runDecompose: () => Promise<void>
  clearDecompose: () => void
}

export function useDecomposeLayers(node: GenerationCanvasNode, imageUrl: string): DecomposeLayersController {
  const [decomposeBusy, setDecomposeBusy] = React.useState(false)
  const [decomposeState, setDecomposeState] = React.useState<WhiteboardState | null>(null)

  const runDecompose = React.useCallback(async () => {
    if (!imageUrl || decomposeBusy) return
    // 先确保 Replicate 已接入，否则引导去接入（不甩死胡同错误）。
    if (!(await ensureReplicateConnectedOrGuide())) return
    const grantId = await confirmAndMintGrant({
      nodeIds: [node.id],
      title: '拆解元素',
      message: `${describeGenerationCost(1, 'image')}（把这张图拆成可独立编辑的图层）`,
      confirmLabel: '拆解',
      light: true,
    })
    if (!grantId) return
    setDecomposeBusy(true)
    toast('拆解中…约 15 秒', 'info')
    try {
      const bridge = getDesktopBridge()
      if (!bridge) throw new Error('桌面端不可用')
      // 主进程已就地把图层落盘成 nomi-local（传 projectId 触发），渲染层拿到即用、秒开白板。
      const { layers } = await bridge.image.decomposeLayers({
        nodeId: node.id,
        imageUrl,
        numLayers: DECOMPOSE_LAYERS,
        grantId,
        projectId: getDesktopActiveProjectId() || undefined,
      })
      if (!layers || layers.length === 0) throw new Error('拆解未返回图层')
      const ratio = inferWhiteboardAspectRatio(node.meta?.imageWidth, node.meta?.imageHeight)
      setDecomposeState(buildLayerWhiteboardState(layers, ratio))
      toast('已拆成图层，拖动元素后关闭画板即合成回图', 'success')
    } catch (error) {
      toast(error instanceof Error && error.message ? error.message : '拆解失败，请稍后重试', 'error')
    } finally {
      setDecomposeBusy(false)
    }
  }, [decomposeBusy, imageUrl, node])

  const clearDecompose = React.useCallback(() => setDecomposeState(null), [])

  return { decomposeBusy, decomposeState, runDecompose, clearDecompose }
}

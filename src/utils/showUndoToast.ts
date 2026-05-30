/**
 * 撤销 toast — 用于跨分类拖拽创建独立副本场景（spec §6.6 / 决策 3）。
 *
 * 触发：跨分类拖拽完成、跨分类 Cmd+V 粘贴。
 * 行为：5 秒内可点击 toast 任意位置 = 撤销（删除刚创建的副本节点）；
 *      5 秒后自动消失，副本永久保留。
 *
 * MVP 实现：依赖 @mantine/notifications；整张 toast 都是 clickable 表面。
 * 未来 iteration 可换成专门的 [撤销] 按钮 + 倒计时条更精致的样式。
 */
import { notifications } from '@mantine/notifications'

export type UndoToastOptions = {
  message: string
  onUndo: () => void
  durationMs?: number
}

const DEFAULT_DURATION_MS = 5000

let toastSeq = 0

export function showUndoToast({ message, onUndo, durationMs = DEFAULT_DURATION_MS }: UndoToastOptions): void {
  const id = `undo-toast-${++toastSeq}`
  let consumed = false

  try {
    notifications.show({
      id,
      message: `${message}  ·  点击此处撤销`,
      color: 'gray',
      autoClose: durationMs,
      withCloseButton: true,
      onClick: () => {
        if (consumed) return
        consumed = true
        try { onUndo() } catch { /* swallow undo failures, toast UI 已消失 */ }
        notifications.hide(id)
      },
      onClose: () => {
        consumed = true
      },
    })
  } catch (_err) {
    // notifications system 未挂载时静默放行（如测试环境）
  }
}

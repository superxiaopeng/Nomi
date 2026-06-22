import { notifications } from '@mantine/notifications'

// 全仓唯一通用 toast。统一走 @mantine/notifications 的单一容器（main.tsx 的 <Notifications/>）。
// 语义变体 showUndoToast（点击撤销）/ showInfoToast（一次性告知）也走同一容器，不再有本地并行 store/host。
type ToastType = 'info' | 'success' | 'error' | 'warning'

export function toast(message: string, type?: ToastType): void {
  const color = type === 'error' ? 'red' : type === 'success' ? 'teal' : type === 'warning' ? 'yellow' : 'gray'
  try {
    notifications.show({ message, color })
  } catch {
    /* notifications 容器未挂载（如测试环境）→ 静默放行 */
  }
}

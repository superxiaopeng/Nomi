// 滚轮命中判定：从 target 往上找「能在 deltaY 方向继续滚动」的可滚祖先（到 boundary 为止）。
// 找到 = 这次 wheel 该交给原生滚动（卡内提示词编辑器等），画布不缩放。从 GenerationCanvas 抽出（规则 12）。
export function findScrollableAncestor(target: Element, boundary: HTMLElement | null, deltaY: number): boolean {
  let el: Element | null = target
  while (el && el !== boundary) {
    if (el instanceof HTMLElement) {
      const style = window.getComputedStyle(el)
      const canScrollY = (style.overflowY === 'auto' || style.overflowY === 'scroll') && el.scrollHeight > el.clientHeight
      if (canScrollY) {
        const atTop = el.scrollTop <= 0
        const atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 1
        // 还有可滚空间（往下没到底 / 往上没到顶）才放行；到边界则继续找上层，最终回落缩放。
        if ((deltaY > 0 && !atBottom) || (deltaY < 0 && !atTop)) return true
      }
    }
    el = el.parentElement
  }
  return false
}

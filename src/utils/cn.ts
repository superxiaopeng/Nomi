import { clsx, type ClassValue } from 'clsx'
import { extendTailwindMerge } from 'tailwind-merge'

// 把项目自定义字号 token(tailwind.config fontSize:micro/caption/body/body-sm/title)注册进 twMerge 的
// font-size 组。否则原版 twMerge 不认它们,会把 `text-micro` 误判成与 `text-nomi-ink-*`(颜色)同组冲突,
// 按出现顺序丢掉其一 —— 导致 `cn('text-micro ... text-nomi-ink-60')` 里 text-micro 被吞、字号回退 16px。
//
// 同理注册自定义圆角 token(tailwind.config borderRadius)进 twMerge 的 `rounded` 组。否则原版不认
// `rounded-workbench-control`/`rounded-nomi*` 等自定义键,不会与 `rounded-full` 去重 —— 组件基类的
// `rounded-workbench-control`(WorkbenchButton)和调用点的 `rounded-full` 会并存,谁赢看 CSS 顺序,
// 造成同类组件在不同挂载点外圆角不一致(如创作/生成助手收起胶囊圆角不一)。
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      'font-size': [{ text: ['micro', 'caption', 'body', 'body-sm', 'title'] }],
      rounded: [{ rounded: ['sharp', 'field', 'panel', 'modal', 'pill', 'nomi', 'nomi-sm', 'nomi-lg', 'workbench', 'workbench-control'] }],
    },
  },
})

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

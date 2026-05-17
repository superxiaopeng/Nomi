import React from 'react'
import { motion } from 'framer-motion'

type Act0Props = {
  onContinue: () => void
}

const BOOT_STEPS = [
  '正在初始化本地数据库',
  '正在启动本地 API',
  '正在加载 Agent 桥',
  '准备就绪',
]

export function Act0Welcome({ onContinue }: Act0Props): JSX.Element {
  const [bootStep, setBootStep] = React.useState(0)
  const [showCta, setShowCta] = React.useState(false)

  React.useEffect(() => {
    const timers: number[] = []
    BOOT_STEPS.forEach((_, idx) => {
      if (idx === 0) return
      timers.push(window.setTimeout(() => setBootStep(idx), 700 * idx))
    })
    timers.push(window.setTimeout(() => setShowCta(true), 700 * BOOT_STEPS.length + 300))
    return () => { timers.forEach(window.clearTimeout) }
  }, [])

  return (
    <div className="nomi-ob__hero">
      <motion.div
        className="nomi-ob__orb"
        initial={{ opacity: 0, scale: 0.6 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 2.4, ease: [0.22, 1, 0.36, 1] }}
      />

      <motion.h1
        className="nomi-ob__title"
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 1.1, ease: [0.22, 1, 0.36, 1] }}
      >
        欢迎来到 Nomi
      </motion.h1>

      <motion.p
        className="nomi-ob__sub"
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.9, delay: 0.3, ease: [0.22, 1, 0.36, 1] }}
      >
        从一段故事，到一支视频。<br />
        AI 帮你把剧本、画面、视频、剪辑全部串起来。<br />
        全程在你的电脑上跑，素材不离开本地。
      </motion.p>

      <motion.div
        className="nomi-ob__boot-label"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.6, delay: 0.6 }}
      >
        <motion.span
          key={`step-${bootStep}`}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35 }}
        >
          ▸ {BOOT_STEPS[bootStep]}
        </motion.span>
      </motion.div>

      <motion.button
        className="nomi-ob__cta"
        onClick={onContinue}
        disabled={!showCta}
        initial={{ opacity: 0, scale: 0.92 }}
        animate={{ opacity: showCta ? 1 : 0, scale: showCta ? 1 : 0.92 }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        whileHover={showCta ? { scale: 1.04 } : undefined}
        whileTap={showCta ? { scale: 0.98 } : undefined}
      >
        开始 →
      </motion.button>
    </div>
  )
}

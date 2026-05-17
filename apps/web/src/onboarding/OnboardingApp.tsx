import React from 'react'
import { useNavigate } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import './styles.css'
import { useOnboardingStore, type OnboardingAct } from './onboardingStore'
import { markOnboardingDone } from './onboardingFlags'
import { Act0Welcome } from './acts/Act0Welcome'
import { ActStub } from './acts/ActStub'
import { buildStudioUrl } from '../utils/appRoutes'

const TOTAL_ACTS = 5

function ProgressBar({ act }: { act: OnboardingAct }): JSX.Element {
  return (
    <div className="nomi-ob__progress" aria-label="引导进度">
      {Array.from({ length: TOTAL_ACTS }).map((_, idx) => {
        let cls = 'nomi-ob__dot'
        if (idx === act) cls += ' nomi-ob__dot--active'
        else if (idx < act) cls += ' nomi-ob__dot--passed'
        return <span key={idx} className={cls} />
      })}
    </div>
  )
}

export default function OnboardingApp(): JSX.Element {
  const navigate = useNavigate()
  const act = useOnboardingStore((s) => s.act)
  const next = useOnboardingStore((s) => s.next)
  const back = useOnboardingStore((s) => s.back)

  const finishOnboarding = React.useCallback(() => {
    markOnboardingDone()
    navigate(buildStudioUrl(), { replace: true })
  }, [navigate])

  const handleNext = React.useCallback(() => {
    if (act === 4) {
      finishOnboarding()
    } else {
      next()
    }
  }, [act, next, finishOnboarding])

  const renderAct = (): JSX.Element => {
    switch (act) {
      case 0:
        return <Act0Welcome onContinue={handleNext} />
      case 1:
        return <ActStub title="先给 Nomi 一个 AI 大脑" hint="即将接入：填入 DeepSeek API Key，Nomi 会发一句『你好』验证连通——这一幕的完整交互正在搭建中。" onContinue={handleNext} />
      case 2:
        return <ActStub title="再给 Nomi 一支画笔" hint="即将接入：填入即梦/可灵 API，Nomi 会生成一张『见面礼』图作为你来的纪念。" onContinue={handleNext} />
      case 3:
        return <ActStub title="看 AI 自动跑完一支广告" hint="即将接入：自动加载一段三镜头产品广告剧本，AI 会拆镜头、并行生图生视频、排进时间轴——你只用看着。" onContinue={handleNext} />
      case 4:
        return <ActStub title="你的第一个项目" hint="即将接入：选一个模板或写下你想拍的故事，Nomi 会带着这段数据进入工作台。" onContinue={handleNext} />
      default:
        return <Act0Welcome onContinue={handleNext} />
    }
  }

  return (
    <div className="nomi-ob">
      <header className="nomi-ob__top">
        <div className="nomi-ob__brand">
          <svg viewBox="0 0 32 32" aria-hidden="true">
            <circle cx="16" cy="16" r="14" fill="none" stroke="currentColor" strokeWidth="1.5" />
            <path d="M11 13 L11 21 L13 21 L13 17 L19 21 L21 21 L21 13 L19 13 L19 17 L13 13 Z" fill="currentColor" />
          </svg>
          <span>NOMI</span>
        </div>
        <ProgressBar act={act} />
        <button className="nomi-ob__skip" onClick={finishOnboarding} type="button">跳过引导</button>
      </header>

      <main className="nomi-ob__stage">
        <AnimatePresence mode="wait">
          <motion.div
            className="nomi-ob__stage-inner"
            key={act}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -16 }}
            transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
          >
            {renderAct()}
          </motion.div>
        </AnimatePresence>
      </main>

      <footer className="nomi-ob__footer">
        <button className="nomi-ob__back" onClick={back} disabled={act === 0} type="button">← 上一步</button>
        <span className="nomi-ob__act-hint">{`第 ${act + 1} 幕 · 共 ${TOTAL_ACTS} 幕`}</span>
        <span className="nomi-ob__footer-spacer" aria-hidden="true" />
      </footer>
    </div>
  )
}

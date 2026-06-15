/**
 * 首启开屏动画（spec §3A）。
 *
 * 浅色 / 克制 / 极简：用 Nomi 真实 UI 元素的抽象讲产品理念，不用 AI 大图、不走电影深色。
 * 5 段序列（每段 ~2.6s，总 ~13s）：
 *   1 创作卡 → 2 画布节点卡行 → 3 中卡选中 + 操作 chip → 4 时间轴轨 → 5 真 logo 标版
 * 字幕在底部逐段淡入；右上「跳过 ›」随时可退。
 *
 * 渲染在 React 树内（**不 BodyPortal**——portal 到 body 会丢 --nomi-* token 作用域，
 * 见 WorkbenchTour.tsx:12 注释）。framer-motion AnimatePresence + motion 内联模式，
 * 缓动 [0.22,1,0.36,1]（抄 Scene3DFullscreen.tsx:3680）。token-only，禁非 token px/hex。
 */
import React from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { IconRefresh, IconReplace } from '@tabler/icons-react'
import { cn } from '../../utils/cn'
import { NomiBrand } from '../../design'

type SplashIntroProps = {
  onDone: () => void
}

const EASE = [0.22, 1, 0.36, 1] as const
const SCENE_MS = 2600
const SCENE_COUNT = 5

const CAPTIONS = [
  '从你的一句话开始',
  '几秒，铺成一张分镜画布',
  '每一格，你说了算',
  '排进时间轴，导出成片',
  'AI 起草，你定稿',
] as const

// 画布点阵背景（spec §3A：radial-gradient(var(--nomi-ink-20) 1px, transparent 1px) 20px）。
const DOT_GRID: React.CSSProperties = {
  backgroundImage: 'radial-gradient(var(--nomi-ink-20) 1px, transparent 1px)',
  backgroundSize: '20px 20px',
}

// ── 配乐：Web Audio 合成柔和音符随段触发（C 大调上行 + 收尾和弦） ──
// TODO: 后换 CC0 mp3（spec §6 待用户提供免版税轻乐），保留 playSceneTone 接口即可平替。
const SCENE_NOTES = [261.63, 329.63, 392.0, 440.0] // C4 E4 G4 A4
const FINALE_CHORD = [261.63, 329.63, 392.0] // C 大三和弦

type AudioRef = { ctx: AudioContext | null }

function playTone(audio: AudioRef, freq: number, when: number, duration: number, peak: number): void {
  const ctx = audio.ctx
  if (!ctx) return
  const osc = ctx.createOscillator()
  const gain = ctx.createGain()
  osc.type = 'sine'
  osc.frequency.value = freq
  const t0 = ctx.currentTime + when
  gain.gain.setValueAtTime(0, t0)
  gain.gain.linearRampToValueAtTime(peak, t0 + 0.04)
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration)
  osc.connect(gain)
  gain.connect(ctx.destination)
  osc.start(t0)
  osc.stop(t0 + duration + 0.05)
}

function playSceneTone(audio: AudioRef, step: number): void {
  if (!audio.ctx) return
  if (step < SCENE_COUNT - 1) {
    playTone(audio, SCENE_NOTES[step] ?? 392.0, 0, 0.9, 0.06)
  } else {
    // 标版：柔和上行和弦收尾
    FINALE_CHORD.forEach((f, i) => playTone(audio, f, i * 0.08, 1.6, 0.05))
  }
}

export function SplashIntro({ onDone }: SplashIntroProps): JSX.Element {
  const [step, setStep] = React.useState(0)
  const [leaving, setLeaving] = React.useState(false)
  const audioRef = React.useRef<AudioRef>({ ctx: null })
  const doneRef = React.useRef(false)

  const finish = React.useCallback(() => {
    if (doneRef.current) return
    doneRef.current = true
    try {
      audioRef.current.ctx?.close()
    } catch {
      /* ignore */
    }
    audioRef.current.ctx = null
    setLeaving(true)
    // 等淡出动画收尾再卸载（与 exit transition 时长对齐）。
    window.setTimeout(onDone, 460)
  }, [onDone])

  // 懒建 AudioContext（Electron 内无 autoplay 限制；浏览器测试环境失败则静默降级）。
  React.useEffect(() => {
    const audio = audioRef.current
    try {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
      if (Ctor) audio.ctx = new Ctor()
    } catch {
      audio.ctx = null
    }
    return () => {
      try {
        audio.ctx?.close()
      } catch {
        /* ignore */
      }
      audio.ctx = null
    }
  }, [])

  // 每段触发配乐。
  React.useEffect(() => {
    if (leaving) return
    playSceneTone(audioRef.current, step)
  }, [step, leaving])

  // state machine：定时推进；走完最后一段自动收尾。
  React.useEffect(() => {
    if (leaving) return
    const id = window.setTimeout(() => {
      if (step < SCENE_COUNT - 1) {
        setStep((s) => s + 1)
      } else {
        finish()
      }
    }, SCENE_MS)
    return () => window.clearTimeout(id)
  }, [step, leaving, finish])

  return (
    <AnimatePresence>
      {!leaving ? (
        <motion.div
          key="splash-intro"
          className={cn(
            'nomi-splash fixed inset-0 z-[60] bg-nomi-bg text-nomi-ink font-nomi-sans',
            'flex flex-col items-center justify-center overflow-hidden select-none',
          )}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.42, ease: EASE }}
          role="dialog"
          aria-label="Nomi 开屏介绍"
        >
          {/* 跳过 */}
          <button
            type="button"
            onClick={finish}
            data-splash-skip="true"
            className={cn(
              'absolute top-7 right-9 inline-flex items-center gap-1 cursor-pointer font-inherit bg-transparent border-0',
              'text-caption text-nomi-ink-40 transition-colors hover:text-nomi-ink',
            )}
          >
            跳过 ›
          </button>

          {/* 舞台 */}
          <div className="relative flex items-center justify-center w-full max-w-[760px] h-[360px] px-10">
            <AnimatePresence mode="wait">
              <motion.div
                key={step}
                className="w-full flex items-center justify-center"
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -14 }}
                transition={{ duration: 0.5, ease: EASE }}
              >
                <SplashScene step={step} />
              </motion.div>
            </AnimatePresence>
          </div>

          {/* 字幕 */}
          <div className="absolute bottom-[9%] left-0 right-0 flex justify-center px-10">
            <AnimatePresence mode="wait">
              <motion.p
                key={step}
                className="text-body text-nomi-ink-60 text-center m-0"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.4, ease: EASE, delay: 0.12 }}
              >
                {CAPTIONS[step]}
              </motion.p>
            </AnimatePresence>
          </div>
        </motion.div>
      ) : (
        // exit 期间保留覆盖层做淡出（leaving 后 AnimatePresence 走 exit）
        <motion.div
          key="splash-leaving"
          className="fixed inset-0 z-[60] bg-nomi-bg"
          initial={{ opacity: 1 }}
          animate={{ opacity: 0 }}
          transition={{ duration: 0.44, ease: EASE }}
          aria-hidden="true"
        />
      )}
    </AnimatePresence>
  )
}

// ── 各段画面（真实元素抽象，token-only） ──

function SplashScene({ step }: { step: number }): JSX.Element {
  switch (step) {
    case 0:
      return <SceneCreationCard />
    case 1:
      return <SceneNodeRow selected={false} />
    case 2:
      return <SceneNodeRow selected />
    case 3:
      return <SceneTimeline />
    default:
      return <SceneBrand />
  }
}

/** 1 创作卡：编辑器抽象——工具点 + Fraunces 标题 + 文字行。 */
function SceneCreationCard(): JSX.Element {
  return (
    <motion.div
      className="w-full max-w-[420px] bg-nomi-paper border border-nomi-line rounded-nomi shadow-nomi-md p-6"
      initial={{ scale: 0.96 }}
      animate={{ scale: 1 }}
      transition={{ duration: 0.5, ease: EASE }}
    >
      <div className="flex items-center gap-1.5 mb-5">
        <span className="size-2 rounded-pill bg-nomi-ink-20" />
        <span className="size-2 rounded-pill bg-nomi-ink-20" />
        <span className="size-2 rounded-pill bg-nomi-ink-20" />
      </div>
      <p className="font-nomi-display text-title text-nomi-ink m-0 mb-5 leading-snug">
        把你的一句话…
      </p>
      <div className="flex flex-col gap-2.5">
        <span className="h-2 rounded-pill bg-nomi-ink-10 w-full" />
        <span className="h-2 rounded-pill bg-nomi-ink-10 w-5/6" />
        <span className="h-2 rounded-pill bg-nomi-ink-10 w-3/5" />
      </div>
    </motion.div>
  )
}

/** 2/3 画布节点卡行：点阵背景 + 3 张节点卡；selected 时中卡点亮 + 操作 chip。 */
function SceneNodeRow({ selected }: { selected: boolean }): JSX.Element {
  return (
    <div className="relative w-full flex items-center justify-center py-6">
      <div className="absolute inset-0 rounded-nomi-lg opacity-70" style={DOT_GRID} aria-hidden="true" />
      <div className="relative flex items-center justify-center gap-4">
        {[0, 1, 2].map((i) => (
          <NodeCard key={i} index={i} selected={selected && i === 1} />
        ))}
      </div>
    </div>
  )
}

function NodeCard({ index, selected }: { index: number; selected: boolean }): JSX.Element {
  return (
    <motion.div
      className={cn(
        'relative w-[176px] bg-nomi-paper rounded-nomi overflow-hidden',
        selected ? 'border-2 border-nomi-accent shadow-nomi-md' : 'border border-nomi-line',
      )}
      initial={{ y: 0 }}
      animate={{ y: selected ? -10 : 0 }}
      transition={{ duration: 0.45, ease: EASE }}
    >
      <div className="aspect-video bg-nomi-ink-05 grid place-items-center">
        <span className="size-7 rounded-nomi-sm bg-nomi-ink-10" aria-hidden="true" />
      </div>
      <div className="px-3 py-2.5">
        <p className="text-caption text-nomi-ink m-0">镜 {index + 1}</p>
      </div>

      {selected ? (
        <motion.div
          className="absolute -top-3.5 left-1/2 -translate-x-1/2 flex items-center gap-1.5"
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, ease: EASE, delay: 0.18 }}
        >
          <OpChip icon={<IconReplace size={12} stroke={1.8} />} label="切模型" />
          <OpChip icon={<IconRefresh size={12} stroke={1.8} />} label="重生成" />
        </motion.div>
      ) : null}
    </motion.div>
  )
}

function OpChip({ icon, label }: { icon: React.ReactNode; label: string }): JSX.Element {
  return (
    <span className="inline-flex items-center gap-1 h-6 px-2 rounded-pill bg-nomi-paper border border-nomi-line shadow-nomi-sm text-micro text-nomi-ink-60">
      {icon}
      {label}
    </span>
  )
}

/** 4 时间轴轨：画面轨 + 声音轨，clip 块（中段 accent）。 */
function SceneTimeline(): JSX.Element {
  return (
    <motion.div
      className="w-full max-w-[460px] bg-nomi-paper border border-nomi-line rounded-nomi shadow-nomi-md p-5 flex flex-col gap-3"
      initial={{ scale: 0.96 }}
      animate={{ scale: 1 }}
      transition={{ duration: 0.5, ease: EASE }}
    >
      <TimelineTrack label="画面" clips={[1, 1, 1.4, 0.8]} accentIndex={2} />
      <TimelineTrack label="声音" clips={[2, 1.2]} accentIndex={-1} />
    </motion.div>
  )
}

function TimelineTrack({ label, clips, accentIndex }: { label: string; clips: number[]; accentIndex: number }): JSX.Element {
  return (
    <div className="flex items-center gap-3">
      <span className="w-8 shrink-0 text-micro text-nomi-ink-40">{label}</span>
      <div className="flex-1 flex items-center gap-1.5 h-7">
        {clips.map((w, i) => (
          <motion.span
            key={i}
            className={cn(
              'h-full rounded-nomi-sm',
              i === accentIndex ? 'bg-nomi-accent' : 'bg-nomi-ink-10',
            )}
            style={{ flexGrow: w }}
            initial={{ scaleX: 0.7, opacity: 0 }}
            animate={{ scaleX: 1, opacity: 1 }}
            transition={{ duration: 0.4, ease: EASE, delay: 0.1 + i * 0.07 }}
          />
        ))}
      </div>
    </div>
  )
}

/** 5 标版：真 NomiBrand（深圆角块 + 两白竖条）+ Fraunces「Nomi」+ slogan。 */
function SceneBrand(): JSX.Element {
  return (
    <motion.div
      className="flex flex-col items-center gap-4"
      initial={{ opacity: 0, scale: 0.94 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.6, ease: EASE }}
    >
      <NomiBrand markSize={52} wordSize={40} />
    </motion.div>
  )
}

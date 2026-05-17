import { create } from 'zustand'

export type OnboardingAct = 0 | 1 | 2 | 3 | 4

export type LLMProvider = {
  apiBaseUrl: string
  apiKey: string
  model: string
}

export type ImageProvider = {
  vendor: string
  apiKey: string
}

type OnboardingState = {
  act: OnboardingAct
  llm: LLMProvider | null
  image: ImageProvider | null
  demoStartedAt: number | null
  setAct: (act: OnboardingAct) => void
  next: () => void
  back: () => void
  setLLM: (llm: LLMProvider) => void
  setImage: (image: ImageProvider) => void
  startDemo: () => void
  reset: () => void
}

const ACT_ORDER: OnboardingAct[] = [0, 1, 2, 3, 4]

export const useOnboardingStore = create<OnboardingState>((set, get) => ({
  act: 0,
  llm: null,
  image: null,
  demoStartedAt: null,
  setAct: (act) => set({ act }),
  next: () => {
    const current = get().act
    const idx = ACT_ORDER.indexOf(current)
    const nextIdx = Math.min(idx + 1, ACT_ORDER.length - 1)
    set({ act: ACT_ORDER[nextIdx] })
  },
  back: () => {
    const current = get().act
    const idx = ACT_ORDER.indexOf(current)
    const prevIdx = Math.max(idx - 1, 0)
    set({ act: ACT_ORDER[prevIdx] })
  },
  setLLM: (llm) => set({ llm }),
  setImage: (image) => set({ image }),
  startDemo: () => set({ demoStartedAt: Date.now() }),
  reset: () => set({ act: 0, llm: null, image: null, demoStartedAt: null }),
}))

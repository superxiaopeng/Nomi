import React from 'react'
import { createRoot } from 'react-dom/client'
import NomiRouterApp from './NomiRouterApp'
import { RootErrorBoundary } from './ui/ErrorBoundary'
import { MantineProvider } from '@mantine/core'
import { ModalsProvider } from '@mantine/modals'
import { Notifications } from '@mantine/notifications'
// 自托管品牌字体（本地优先：不依赖系统是否装 Inter/Fraunces，保证任意机器一致）。
// 变量字体族名为 'Inter Variable' / 'Fraunces Variable'，已在 nomi-tokens.css 字栈置首。
import '@fontsource-variable/inter/wght.css'
import '@fontsource-variable/fraunces/wght.css'
import './styles/index.css'
import { buildNomiTheme } from './theme/nomiTheme'

const DEFAULT_COLOR_SCHEME = 'light'

function primeColorSchemeAttribute() {
  if (typeof document === 'undefined') return
  document.documentElement.setAttribute('data-mantine-color-scheme', DEFAULT_COLOR_SCHEME)
}

primeColorSchemeAttribute()

// theme 必须传给「外层」MantineProvider —— 它才生成 --mantine-* CSS 变量（含
// --mantine-font-family）。早先用内层 MantineThemeProvider 只给组件 context、不发根 CSS 变量，
// 导致 Mantine 字体一直是默认系统栈、与 CSS 的 Inter Variable 两套并存（2026-06-21 实测根因）。
const nomiTheme = buildNomiTheme()

const container = document.getElementById('root')
if (!container) throw new Error('Root container not found')
const root = container ? createRoot(container) : null

root?.render(
  <React.StrictMode>
    <MantineProvider theme={nomiTheme} forceColorScheme={DEFAULT_COLOR_SCHEME} defaultColorScheme={DEFAULT_COLOR_SCHEME}>
      <ModalsProvider>
        <Notifications position="top-right" zIndex={2000} />
        <RootErrorBoundary>
          <NomiRouterApp />
        </RootErrorBoundary>
      </ModalsProvider>
    </MantineProvider>
  </React.StrictMode>
)

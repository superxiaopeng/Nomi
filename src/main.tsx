import React from 'react'
import { createRoot } from 'react-dom/client'
import NomiRouterApp from './NomiRouterApp'
// 自托管品牌字体（本地优先：不依赖系统是否装 Inter/Fraunces，保证任意机器一致）。
// 变量字体族名为 'Inter Variable' / 'Fraunces Variable'，已在 nomi-tokens.css 字栈置首。
import '@fontsource-variable/inter/wght.css'
import '@fontsource-variable/fraunces/wght.css'
import './styles/index.css'
import { NomiAppProviders } from './NomiAppProviders'
import { primeNomiColorScheme } from './theme/colorScheme'
import { NomiColorSchemeProvider } from './theme/NomiColorSchemeProvider'

primeNomiColorScheme()

const container = document.getElementById('root')
if (!container) throw new Error('Root container not found')
const root = container ? createRoot(container) : null

root?.render(
  <React.StrictMode>
    <NomiColorSchemeProvider>
      <NomiAppProviders>
        <NomiRouterApp />
      </NomiAppProviders>
    </NomiColorSchemeProvider>
  </React.StrictMode>
)

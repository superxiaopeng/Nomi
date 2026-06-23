import React from 'react'

export type NomiColorScheme = 'light' | 'dark'

export type NomiColorSchemeContextValue = {
  colorScheme: NomiColorScheme
  isDark: boolean
  setColorScheme: (scheme: NomiColorScheme) => void
  toggleColorScheme: () => void
}

export const STORAGE_KEY = 'nomi-color-scheme'
export const DEFAULT_COLOR_SCHEME: NomiColorScheme = 'light'

export const NomiColorSchemeContext = React.createContext<NomiColorSchemeContextValue | null>(null)

export function normalizeColorScheme(value: unknown): NomiColorScheme {
  return value === 'dark' ? 'dark' : DEFAULT_COLOR_SCHEME
}

export function readStoredColorScheme(): NomiColorScheme {
  if (typeof window === 'undefined') return DEFAULT_COLOR_SCHEME
  try {
    return normalizeColorScheme(window.localStorage.getItem(STORAGE_KEY))
  } catch {
    return DEFAULT_COLOR_SCHEME
  }
}

export function applyNomiColorScheme(scheme: NomiColorScheme): void {
  if (typeof document === 'undefined') return
  const normalized = normalizeColorScheme(scheme)
  const root = document.documentElement
  root.dataset.theme = normalized
  root.dataset.nomiColorScheme = normalized
  root.setAttribute('data-mantine-color-scheme', normalized)
  root.style.colorScheme = normalized
  try {
    window.localStorage.setItem(STORAGE_KEY, normalized)
  } catch {
    // Ignore storage failures; the in-memory theme still applies for this session.
  }
}

export function primeNomiColorScheme(): NomiColorScheme {
  const scheme = readStoredColorScheme()
  applyNomiColorScheme(scheme)
  return scheme
}

export function useNomiColorScheme(): NomiColorSchemeContextValue {
  const context = React.useContext(NomiColorSchemeContext)
  if (!context) {
    throw new Error('useNomiColorScheme must be used within NomiColorSchemeProvider')
  }
  return context
}

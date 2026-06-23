import React from 'react'
import {
  applyNomiColorScheme,
  NomiColorSchemeContext,
  normalizeColorScheme,
  primeNomiColorScheme,
  type NomiColorScheme,
  type NomiColorSchemeContextValue,
} from './colorScheme'

export function NomiColorSchemeProvider({ children }: { children: React.ReactNode }): JSX.Element {
  const [colorScheme, setColorSchemeState] = React.useState<NomiColorScheme>(() => primeNomiColorScheme())

  const setColorScheme = React.useCallback((scheme: NomiColorScheme) => {
    setColorSchemeState(normalizeColorScheme(scheme))
  }, [])

  React.useEffect(() => {
    applyNomiColorScheme(colorScheme)
  }, [colorScheme])

  const value = React.useMemo<NomiColorSchemeContextValue>(() => ({
    colorScheme,
    isDark: colorScheme === 'dark',
    setColorScheme,
    toggleColorScheme: () => setColorScheme(colorScheme === 'dark' ? 'light' : 'dark'),
  }), [colorScheme, setColorScheme])

  return (
    <NomiColorSchemeContext.Provider value={value}>
      {children}
    </NomiColorSchemeContext.Provider>
  )
}

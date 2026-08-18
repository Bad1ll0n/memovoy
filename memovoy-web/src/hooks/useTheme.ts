'use client'

import { useCallback, useSyncExternalStore } from 'react'

type Theme = 'dark' | 'light'

const STORAGE_KEY = 'memovoy-theme'

// O tema vive no <html>, não no React: um script inline em app/layout.tsx
// aplica-o antes da hidratação para não haver flash. O React limita-se a
// observá-lo — daí useSyncExternalStore em vez de estado sincronizado por
// efeito, que provocava renders em cascata.

const listeners = new Set<() => void>()

function subscribe(onChange: () => void) {
  listeners.add(onChange)
  return () => { listeners.delete(onChange) }
}

/**
 * A preferência persistida é a fonte de verdade, tal como no efeito que este
 * hook substituiu. O localStorage pode lançar em modos de privacidade — o
 * script inline do layout tem o mesmo try/catch.
 */
function getSnapshot(): Theme {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'light' ? 'light' : 'dark'
  } catch {
    return 'dark'
  }
}

/** No servidor não há DOM nem localStorage; o script inline corrige no cliente. */
function getServerSnapshot(): Theme {
  return 'dark'
}

function applyTheme(t: Theme) {
  localStorage.setItem(STORAGE_KEY, t)
  if (t === 'light') {
    document.documentElement.setAttribute('data-theme', 'light')
  } else {
    document.documentElement.removeAttribute('data-theme')
  }
  listeners.forEach((l) => l())
}

export function useTheme() {
  const theme = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)

  const toggle = useCallback(() => {
    applyTheme(getSnapshot() === 'dark' ? 'light' : 'dark')
  }, [])

  return { theme, toggle }
}

'use client'

import { useEffect, useState } from 'react'
import { Moon, Sun } from 'lucide-react'

export function ThemeToggle({ className }: { className?: string }) {
  const [isDark, setIsDark] = useState(true)

  useEffect(() => {
    const stored = localStorage.getItem('memovoy-theme')
    const dark = stored !== 'light'
    setIsDark(dark)
    document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light')
  }, [])

  function toggle() {
    const next = isDark ? 'light' : 'dark'
    setIsDark(!isDark)
    document.documentElement.setAttribute('data-theme', next)
    localStorage.setItem('memovoy-theme', next)
  }

  return (
    <button
      onClick={toggle}
      aria-label={isDark ? 'Activar modo claro' : 'Activar modo escuro'}
      className={`flex items-center gap-2 p-2 rounded-lg hover:opacity-80 transition-opacity ${className ?? ''}`}
      style={{ color: 'var(--text-secondary)' }}
    >
      {isDark
        ? <Sun className="w-4 h-4" />
        : <Moon className="w-4 h-4" />
      }
      <span className="text-sm">{isDark ? 'Modo claro' : 'Modo escuro'}</span>
    </button>
  )
}

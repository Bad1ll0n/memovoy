'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Check } from 'lucide-react'
import { useRequireAuth } from '@/hooks/useRequireAuth'
import { useValorDoCliente } from '@/hooks/useValorDoCliente'
import { Spinner } from '@/components/ui/Spinner'

const LANG_KEY = 'memovoy-lang'

function lerIdiomaGuardado() {
  try {
    return localStorage.getItem(LANG_KEY) ?? 'pt'
  } catch {
    return 'pt'
  }
}

const LANGUAGES = [
  { code: 'pt', label: 'Português', native: 'Português (PT)', flag: '🇵🇹' },
  { code: 'en', label: 'English', native: 'English (EN)', flag: '🇬🇧' },
]

export default function LanguagePage() {
  const router = useRouter()
  const { isReady } = useRequireAuth()
  // O valor guardado é a fonte de verdade; `escolhido` sobrepõe-se assim que
  // o utilizador clica, sem esperar por nova leitura do localStorage.
  const guardado = useValorDoCliente(lerIdiomaGuardado, 'pt')
  const [escolhido, setEscolhido] = useState<string | null>(null)
  const lang = escolhido ?? guardado

  function selectLang(code: string) {
    setEscolhido(code)
    try { localStorage.setItem(LANG_KEY, code) } catch {}
  }

  if (!isReady) {
    return (
      <div className="flex justify-center py-12">
        <Spinner size="lg" />
      </div>
    )
  }

  return (
    <div>
      <button
        onClick={() => router.back()}
        className="flex items-center gap-2 mb-5 text-sm hover:opacity-80 transition-opacity"
        style={{ color: 'var(--text-muted)' }}
      >
        <ArrowLeft className="w-4 h-4" />
        Voltar
      </button>

      <h1 className="text-xl font-bold mb-2" style={{ color: 'var(--text-primary)' }}>
        Idioma
      </h1>
      <p className="text-sm mb-6" style={{ color: 'var(--text-muted)' }}>
        Escolhe o idioma da interface.
      </p>

      <div className="card overflow-hidden">
        {LANGUAGES.map(({ code, label, native, flag }, i) => (
          <button
            key={code}
            onClick={() => selectLang(code)}
            className="w-full flex items-center gap-3 px-4 py-3 text-left transition-colors hover:opacity-80"
            style={{
              borderBottom: i < LANGUAGES.length - 1 ? '1px solid var(--border)' : 'none',
              background: lang === code ? 'rgba(252,163,17,0.07)' : 'transparent',
            }}
          >
            <span className="text-2xl">{flag}</span>
            <div className="flex-1">
              <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                {label}
              </p>
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                {native}
              </p>
            </div>
            {lang === code && (
              <Check className="w-4 h-4 shrink-0" style={{ color: 'var(--accent)' }} />
            )}
          </button>
        ))}
      </div>

    </div>
  )
}

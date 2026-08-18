'use client'

import { useState } from 'react'
import { X, ChevronRight, Wand2, Map, Trophy } from 'lucide-react'
import { useAuthStore } from '@/store/authStore'
import { useValorDoCliente } from '@/hooks/useValorDoCliente'

const TOUR_KEY = 'memovoy-tour-v1'

function tourJaVisto() {
  try {
    return localStorage.getItem(TOUR_KEY) !== null
  } catch {
    return true
  }
}

const STEPS = [
  {
    Icon:    Wand2,
    title:   'Planeia com IA',
    body:    'Vai a Roteiros → Criar roteiro e deixa a nossa IA gerar um itinerário completo dia a dia em segundos.',
  },
  {
    Icon:    Map,
    title:   'Vê as actividades no mapa',
    body:    'Em cada roteiro há um mapa interactivo com todos os pontos do dia. Toca num pin para ver detalhes e abrir no Google Maps.',
  },
  {
    Icon:    Trophy,
    title:   'Conquistas e pontuação',
    body:    'Publica posts, cria roteiros e faz check-in para ganhar pontos e desbloquear badges. Vê os teus rankings no separador Rankings.',
  },
]

export function FeatureTour() {
  const { user } = useAuthStore()
  const [step, setStep] = useState(0)
  // No servidor assume-se já visto, para o tour não piscar na hidratação.
  const jaVisto = useValorDoCliente(tourJaVisto, true)
  const [dispensado, setDispensado] = useState(false)
  const visible = Boolean(user) && !jaVisto && !dispensado
  const setVisible = (v: boolean) => setDispensado(!v)

  function dismiss() {
    localStorage.setItem(TOUR_KEY, '1')
    setVisible(false)
  }

  function next() {
    if (step < STEPS.length - 1) {
      setStep((s) => s + 1)
    } else {
      dismiss()
    }
  }

  if (!visible) return null

  const { Icon, title, body } = STEPS[step]

  return (
    <div
      className="fixed bottom-20 right-4 lg:bottom-6 lg:right-6 z-50 w-72 animate-fade-in"
      style={{
        background:   'var(--card-bg)',
        border:       '1px solid var(--border)',
        borderRadius: 16,
        boxShadow:    '0 8px 32px rgba(0,0,0,0.3)',
      }}
      role="dialog"
      aria-modal="true"
      aria-label={`Tour: ${title}`}
    >
      <div className="flex items-start justify-between p-4 pb-0">
        <div
          className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0"
          style={{ background: 'var(--accent)', color: '#000' }}
        >
          <Icon className="w-4 h-4" />
        </div>
        <button
          onClick={dismiss}
          className="p-1 rounded-lg hover:opacity-70 transition-opacity"
          style={{ color: 'var(--text-muted)' }}
          aria-label="Fechar tour"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="p-4">
        <h3 className="font-bold text-sm mb-1" style={{ color: 'var(--text-primary)' }}>
          {title}
        </h3>
        <p className="text-xs leading-relaxed" style={{ color: 'var(--text-muted)' }}>
          {body}
        </p>
      </div>

      <div
        className="flex items-center justify-between px-4 py-3"
        style={{ borderTop: '1px solid var(--border)' }}
      >
        <div className="flex gap-1">
          {STEPS.map((_, i) => (
            <div
              key={i}
              className="w-1.5 h-1.5 rounded-full transition-colors"
              style={{ background: i === step ? 'var(--accent)' : 'var(--border)' }}
            />
          ))}
        </div>
        <button
          onClick={next}
          className="flex items-center gap-1 text-xs font-semibold px-3 py-1.5 rounded-lg transition-opacity hover:opacity-80"
          style={{ background: 'var(--accent)', color: '#000' }}
        >
          {step < STEPS.length - 1 ? 'Próximo' : 'Entendido'}
          {step < STEPS.length - 1 && <ChevronRight className="w-3.5 h-3.5" />}
        </button>
      </div>
    </div>
  )
}

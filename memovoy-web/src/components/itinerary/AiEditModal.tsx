'use client'

/**
 * Trocar uma actividade por outra, com três alternativas geradas.
 *
 * Estava dentro do ItineraryClient, e só lá. Isso queria dizer que só se podia
 * mudar uma actividade DEPOIS de guardar o roteiro — que é tarde: quem revê um
 * roteiro acabado de gerar quer mexer no que não gosta antes de o aceitar, não
 * guardar primeiro e corrigir a seguir.
 *
 * Aplica a alteração no servidor antes de avisar quem chama. Isso é
 * deliberado: o ecrã de revisão trabalha sobre um roteiro que já existe na
 * base de dados (por confirmar e privado), portanto guardar cada troca à
 * medida que acontece é o que faz o "Descartar" ter sentido — descarta um
 * roteiro inteiro e coerente, não metade de uma edição.
 */

import { useState } from 'react'
import { MapPin, Sparkles, Wand2, X } from 'lucide-react'
import { api, getAccessToken, API_URL } from '@/lib/api'
import { Spinner } from '@/components/ui/Spinner'
import { AlertBanner } from '@/components/ui/AlertBanner'
import { activityTypeLabel, type Activity, type EditTarget } from './actividade'

export function AiEditModal({
  target,
  itineraryId,
  onClose,
  onAccept,
}: {
  target: EditTarget
  itineraryId: string
  onClose: () => void
  onAccept: (activity: Activity, ctx: { feedback: string; originalActivity: Activity }) => void
}) {
  type Suggestion = Activity & { whyThisOne?: string }

  const [feedback, setFeedback]         = useState('')
  const [suggestions, setSuggestions]   = useState<Suggestion[]>([])
  const [suggesting, setSuggesting]     = useState(false)
  const [acceptingIdx, setAcceptingIdx] = useState<number | null>(null)
  const [error, setError]               = useState('')

  async function handleSuggest() {
    if (!feedback.trim()) return
    setSuggesting(true)
    setError('')
    setSuggestions([])
    try {
      const res = await fetch(`${API_URL}/itineraries/${itineraryId}/suggest/stream`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(getAccessToken() ? { Authorization: `Bearer ${getAccessToken()}` } : {}),
        },
        body: JSON.stringify({
          dayIndex:      target.dayIndex,
          activityIndex: target.activityIndex,
          feedback:      feedback.trim(),
        }),
      })
      if (!res.ok || !res.body) throw new Error('Erro ao gerar sugestões.')

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buf = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buf += decoder.decode(value, { stream: true })
        const lines = buf.split('\n')
        buf = lines.pop() ?? ''
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          const payload = line.slice(6)
          if (payload === '[DONE]') break
          try {
            const { suggestion, error: err } = JSON.parse(payload)
            if (err) throw new Error('Erro ao gerar sugestões.')
            if (suggestion) setSuggestions((prev) => [...prev, suggestion as Suggestion])
          } catch (e) {
            if (e instanceof Error && e.message.includes('Erro')) throw e
          }
        }
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao gerar sugestões.')
    } finally {
      setSuggesting(false)
    }
  }

  async function handleAccept(s: Suggestion, idx: number) {
    setAcceptingIdx(idx)
    setError('')
    try {
      await api.patch(`/itineraries/${itineraryId}/activity`, {
        dayIndex:      target.dayIndex,
        activityIndex: target.activityIndex,
        activity:      s,
      })
      onAccept(s, { feedback: feedback.trim(), originalActivity: target.activity })
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao aplicar alteração.')
      setAcceptingIdx(null)
    }
  }

  return (
    <div
      className="fixed inset-0 z-[1100] flex items-end sm:items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.6)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        className="w-full max-w-lg rounded-2xl p-5 space-y-4 max-h-[90vh] overflow-y-auto"
        style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Wand2 className="w-4 h-4" style={{ color: 'var(--accent)' }} />
            <h2 className="font-bold text-sm" style={{ color: 'var(--text-primary)' }}>
              Editar com IA
            </h2>
          </div>
          <button onClick={onClose} className="btn btn-ghost p-1" aria-label="Fechar">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Current activity */}
        <div className="rounded-xl p-3 text-sm" style={{ background: 'var(--surface2)' }}>
          <p className="font-semibold mb-0.5" style={{ color: 'var(--text-primary)' }}>
            {target.activity.name}
          </p>
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
            {target.activity.time} · {activityTypeLabel[target.activity.type] ?? target.activity.type}
          </p>
        </div>

        {/* Feedback input */}
        <div>
          <label className="label">O que queres mudar?</label>
          <textarea
            className="input resize-none"
            rows={2}
            placeholder="Ex: algo mais barato, alternativa vegetariana, diferente localização…"
            value={feedback}
            onChange={(e) => setFeedback(e.target.value)}
            maxLength={500}
            disabled={suggesting}
          />
        </div>

        <button
          className="btn btn-primary w-full gap-2"
          onClick={handleSuggest}
          disabled={suggesting || !feedback.trim()}
        >
          {suggesting ? <Spinner size="sm" /> : <Sparkles className="w-4 h-4" />}
          Gerar 3 alternativas
        </button>

        {error && <AlertBanner variant="danger" message={error} />}

        {/* 3 Suggestions */}
        {suggestions.length > 0 && (
          <div className="space-y-3">
            <p className="text-xs font-semibold" style={{ color: 'var(--accent)' }}>
              Escolhe uma alternativa:
            </p>
            {suggestions.map((s, i) => (
              <div
                key={i}
                className="rounded-xl p-4 space-y-1.5"
                style={{ background: 'var(--accent-faint)', border: '1px solid var(--accent-subtle)' }}
              >
                {s.whyThisOne && (
                  <p className="text-[11px] italic mb-1" style={{ color: 'var(--accent)' }}>
                    {s.whyThisOne}
                  </p>
                )}
                <p className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>
                  {s.name}
                </p>
                <p className="text-xs leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                  {s.description}
                </p>
                {s.address && (
                  <p className="flex items-center gap-1 text-xs" style={{ color: 'var(--text-muted)' }}>
                    <MapPin className="w-3 h-3 shrink-0" />
                    {s.address}
                  </p>
                )}
                {s.cost !== null && s.cost !== undefined && (
                  <p className="text-xs font-bold" style={{ color: 'var(--accent)' }}>
                    {s.currency} {s.cost}
                  </p>
                )}
                <button
                  className="btn btn-primary w-full mt-1.5 text-xs py-1.5"
                  onClick={() => handleAccept(s, i)}
                  disabled={acceptingIdx !== null}
                >
                  {acceptingIdx === i ? <Spinner size="sm" /> : 'Aceitar esta'}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

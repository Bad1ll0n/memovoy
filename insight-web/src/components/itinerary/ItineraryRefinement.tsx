'use client'

import { useRef, useState } from 'react'
import { Sparkles, Send, X, ChevronDown, ChevronUp } from 'lucide-react'
import { api } from '@/lib/api'
import { Spinner } from '@/components/ui/Spinner'

interface Message {
  role: 'user' | 'assistant'
  content: string
}

interface Props {
  itineraryId: string
  onDaysUpdated: (days: unknown[]) => void
}

export function ItineraryRefinement({ itineraryId, onDaysUpdated }: Props) {
  const [open, setOpen]               = useState(false)
  const [input, setInput]             = useState('')
  const [history, setHistory]         = useState<Message[]>([])
  const [loading, setLoading]         = useState(false)
  const [error, setError]             = useState('')
  const inputRef                      = useRef<HTMLInputElement>(null)
  const chatRef                       = useRef<HTMLDivElement>(null)

  async function handleSend(e: React.FormEvent) {
    e.preventDefault()
    const msg = input.trim()
    if (!msg || loading) return

    const userMsg: Message = { role: 'user', content: msg }
    const newHistory = [...history, userMsg]
    setHistory(newHistory)
    setInput('')
    setLoading(true)
    setError('')

    try {
      const { days } = await api.post<{ days: unknown[] }>(`/itineraries/${itineraryId}/refine`, {
        userMessage:         msg,
        conversationHistory: history.slice(-10),
      })
      onDaysUpdated(days)
      const assistantMsg: Message = {
        role: 'assistant',
        content: 'Roteiro atualizado! Podes continuar a pedir ajustes.',
      }
      setHistory([...newHistory, assistantMsg])
      setTimeout(() => chatRef.current?.scrollTo({ top: chatRef.current.scrollHeight, behavior: 'smooth' }), 50)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao refinar o roteiro.')
      setHistory(history)
    } finally {
      setLoading(false)
      inputRef.current?.focus()
    }
  }

  return (
    <div
      className="card mb-4 overflow-hidden"
      style={{ border: '1px solid rgba(34,152,206,0.2)' }}
    >
      {/* Header toggle */}
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-2.5 px-4 py-3 hover:opacity-80 transition-opacity"
        style={{ background: 'rgba(34,152,206,0.06)' }}
      >
        <Sparkles className="w-4 h-4 shrink-0" style={{ color: 'var(--accent)' }} />
        <span className="flex-1 text-left text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
          Refinar roteiro com IA
        </span>
        {open ? (
          <ChevronUp className="w-4 h-4" style={{ color: 'var(--text-muted)' }} />
        ) : (
          <ChevronDown className="w-4 h-4" style={{ color: 'var(--text-muted)' }} />
        )}
      </button>

      {open && (
        <div className="flex flex-col" style={{ height: 320 }}>
          {/* Chat messages */}
          <div
            ref={chatRef}
            className="flex-1 overflow-y-auto p-3 space-y-2"
            style={{ background: 'var(--surface2)' }}
          >
            {history.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full gap-2 text-center px-4">
                <Sparkles className="w-8 h-8 opacity-30" style={{ color: 'var(--accent)' }} />
                <p className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>
                  Descreve o que queres mudar
                </p>
                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                  Ex: "Torna o dia 2 mais tranquilo" · "Adiciona uma tarde de praia no dia 3" · "Remove as visitas caras"
                </p>
              </div>
            ) : history.map((msg, i) => (
              <div
                key={i}
                className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className="max-w-[85%] px-3 py-2 rounded-2xl text-sm"
                  style={msg.role === 'user' ? {
                    background: 'var(--accent)',
                    color: '#000',
                    borderBottomRightRadius: 4,
                  } : {
                    background: 'var(--bg-card)',
                    color: 'var(--text-primary)',
                    border: '1px solid var(--border)',
                    borderBottomLeftRadius: 4,
                  }}
                >
                  {msg.content}
                </div>
              </div>
            ))}
            {loading && (
              <div className="flex justify-start">
                <div
                  className="px-3 py-2 rounded-2xl flex items-center gap-1.5"
                  style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}
                >
                  <Spinner size="sm" />
                  <span className="text-xs" style={{ color: 'var(--text-muted)' }}>A refinar…</span>
                </div>
              </div>
            )}
          </div>

          {/* Error */}
          {error && (
            <div className="px-3 py-1.5 text-xs" style={{ background: 'rgba(220,38,38,0.08)', color: 'var(--danger)' }}>
              {error}{' '}
              <button onClick={() => setError('')} className="underline">
                Fechar
              </button>
            </div>
          )}

          {/* Input */}
          <form onSubmit={handleSend} className="flex items-center gap-2 p-2.5 border-t" style={{ borderColor: 'var(--border)' }}>
            {history.length > 0 && (
              <button
                type="button"
                onClick={() => setHistory([])}
                className="p-1.5 rounded-lg hover:opacity-70 transition-opacity shrink-0"
                style={{ color: 'var(--text-muted)' }}
                aria-label="Limpar conversa"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
            <input
              ref={inputRef}
              type="text"
              className="input flex-1 text-sm"
              placeholder="O que queres mudar no roteiro?"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              disabled={loading}
              style={{ borderRadius: 99 }}
            />
            <button
              type="submit"
              disabled={!input.trim() || loading}
              className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 disabled:opacity-40 transition-opacity"
              style={{ background: 'var(--accent)' }}
              aria-label="Enviar"
            >
              <Send className="w-3.5 h-3.5" style={{ color: '#000' }} />
            </button>
          </form>
        </div>
      )}
    </div>
  )
}

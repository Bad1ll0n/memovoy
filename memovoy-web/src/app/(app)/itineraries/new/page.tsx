'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import {
  Compass, ChevronLeft, ChevronRight, Loader2,
  Car, Check, Sparkles,
  Sun, Moon, Clock, MapPin, Sunrise, Sunset
} from 'lucide-react'
import { api } from '@/lib/api'
import { useRequireAuth } from '@/hooks/useRequireAuth'
import { AlertBanner } from '@/components/ui/AlertBanner'
import { RevisaoDoRoteiro } from '@/components/itinerary/RevisaoDoRoteiro'
import type { Day } from '@/components/itinerary/actividade'

// ─── Types ───────────────────────────────────────────────────────────────────

interface WizardData {
  destination: string
  startDate: string
  endDate: string
  groupType: string
  travelStyle: string[]
  mealsIncluded: string[]
  transport: string[]
  extras: string[]
  budget: number
  dayStart: string
  dayEnd: string
}

const STEPS = ['Destino', 'Datas', 'Grupo', 'Estilo', 'Refeições', 'Transporte', 'Extras']

// ─── A que horas corre um dia ──────────────────────────────────────────────
//
// Não são uma preferência inventada: é o que o agente já fazia sozinho, sem
// perguntar a ninguém. Quem não mexer fica exactamente como estava.
const HORA_INICIO_OMISSAO = '09:00'
const HORA_FIM_OMISSAO    = '22:00'

/** A mesma regra que a API impõe. Três horas é o mínimo para caber algo. */
const JANELA_MINIMA_MINUTOS = 180

function emMinutos(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number)
  return h * 60 + m
}

/** O problema da janela em português, ou null se estiver boa. */
function problemaDaJanela(inicio: string, fim: string): string | null {
  if (!inicio || !fim) return 'Indica as duas horas.'
  const duracao = emMinutos(fim) - emMinutos(inicio)
  if (duracao <= 0) return 'O fim tem de ser depois do início.'
  if (duracao < JANELA_MINIMA_MINUTOS) return 'O dia precisa de pelo menos 3 horas.'
  return null
}

/** "13h30" em vez de "13.5 horas". */
function duracaoLegivel(inicio: string, fim: string): string {
  const total = emMinutos(fim) - emMinutos(inicio)
  const h = Math.floor(total / 60)
  const m = total % 60
  return m === 0 ? `${h}h` : `${h}h${String(m).padStart(2, '0')}`
}

// ─── Option groups ─────────────────────────────────────────────────────────

const GROUP_OPTIONS = [
  { value: 'solo',    label: 'Solo',      emoji: '🧳' },
  { value: 'couple',  label: 'Casal',     emoji: '💑' },
  { value: 'friends', label: 'Amigos',    emoji: '👥' },
  { value: 'family',  label: 'Família',   emoji: '👨‍👩‍👧' },
]

const STYLE_OPTIONS = [
  { value: 'adventure',  label: 'Aventura',   emoji: '🏔️' },
  { value: 'culture',    label: 'Cultura',    emoji: '🏛️' },
  { value: 'relaxation', label: 'Relaxamento',emoji: '🏖️' },
  { value: 'gastronomy', label: 'Gastronomia',emoji: '🍴' },
  { value: 'nature',     label: 'Natureza',   emoji: '🌿' },
  { value: 'nightlife',  label: 'Vida noturna',emoji: '🌙' },
]

const MEAL_OPTIONS = [
  { value: 'breakfast', label: 'Pequeno-almoço', emoji: '☕' },
  { value: 'lunch',     label: 'Almoço',         emoji: '🍽️' },
  { value: 'dinner',    label: 'Jantar',          emoji: '🥂' },
]

const TRANSPORT_OPTIONS = [
  { value: 'plane',  label: 'Avião',     emoji: '✈️' },
  { value: 'train',  label: 'Comboio',   emoji: '🚂' },
  { value: 'bus',    label: 'Autocarro', emoji: '🚌' },
  { value: 'car',    label: 'Carro',     emoji: '🚗' },
  { value: 'walking',label: 'A pé',      emoji: '🚶' },
  { value: 'boat',   label: 'Barco',     emoji: '⛵' },
]

const EXTRA_OPTIONS = [
  { value: 'museums',   label: 'Museus',        emoji: '🏛️' },
  { value: 'beaches',   label: 'Praias',         emoji: '🏖️' },
  { value: 'shopping',  label: 'Compras',        emoji: '🛍️' },
  { value: 'sport',     label: 'Desporto',       emoji: '⚽' },
  { value: 'wellness',  label: 'Bem-estar',      emoji: '🧘' },
  { value: 'festivals', label: 'Festivais',      emoji: '🎉' },
]

// ─── Loading steps ─────────────────────────────────────────────────────────

const LOADING_STEPS = [
  'Validando destino…',
  'Pesquisando pontos de interesse…',
  'Gerando itinerário dia a dia…',
  'Calculando rotas e transportes…',
  'Adicionando dicas locais…',
  'Finalizando o teu roteiro…',
]

// ─── Sub-components ────────────────────────────────────────────────────────

function OptionCard({
  emoji, label, active, onClick, multi,
}: {
  emoji: string; label: string; active: boolean; onClick: () => void; multi?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`option-card relative ${active ? 'option-card-active' : ''}`}
    >
      {multi && active && (
        <span
          className="absolute top-1.5 right-1.5 w-4 h-4 rounded-full flex items-center justify-center"
          style={{ background: 'var(--accent)' }}
        >
          <Check className="w-2.5 h-2.5 text-black" />
        </span>
      )}
      <span className="text-2xl">{emoji}</span>
      <span className="text-xs font-medium">{label}</span>
    </button>
  )
}

function ProgressBar({ step }: { step: number }) {
  return (
    <div className="flex gap-1.5 mb-6">
      {STEPS.map((_, i) => (
        <div
          key={i}
          className={`progress-segment ${i <= step ? 'progress-segment-done' : ''}`}
        />
      ))}
    </div>
  )
}

// ─── Destination autocomplete ──────────────────────────────────────────────

type NomResult = {
  display_name: string
  address?: { city?: string; town?: string; village?: string; state?: string; country?: string }
}

function formatNomResult(r: NomResult): string {
  const a = r.address
  if (a) {
    const place = a.city ?? a.town ?? a.village ?? a.state ?? ''
    const country = a.country ?? ''
    if (place && country) return `${place}, ${country}`
  }
  const parts = r.display_name.split(', ')
  return parts.length >= 2 ? `${parts[0]}, ${parts[parts.length - 1]}` : r.display_name
}

function DestinationInput({ value, onChange }: { value: string; onChange: (val: string) => void }) {
  const [query, setQuery] = useState(value)
  const [suggestions, setSuggestions] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState(false)
  const [activeIdx, setActiveIdx] = useState(-1)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const showSuggestions = open && (loading || suggestions.length > 0)

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const val = e.target.value
    setQuery(val)
    onChange(val)
    setActiveIdx(-1)
    setOpen(true)

    if (timer.current) clearTimeout(timer.current)
    if (val.trim().length < 2) { setSuggestions([]); return }

    timer.current = setTimeout(async () => {
      setLoading(true)
      try {
        const res = await fetch(
          `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(val)}&format=json&limit=6&addressdetails=1&accept-language=pt`,
          { headers: { 'User-Agent': 'Memovoy-app/1.0' } },
        )
        const json: NomResult[] = await res.json()
        const names = json
          .map(formatNomResult)
          .filter((v, i, arr) => arr.indexOf(v) === i)
          .slice(0, 5)
        setSuggestions(names)
      } catch {
        setSuggestions([])
      } finally {
        setLoading(false)
      }
    }, 350)
  }

  function select(name: string) {
    setQuery(name)
    onChange(name)
    setSuggestions([])
    setOpen(false)
    setActiveIdx(-1)
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (!open) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveIdx((i) => Math.min(i + 1, suggestions.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIdx((i) => Math.max(i - 1, -1))
    } else if (e.key === 'Enter' && activeIdx >= 0) {
      e.preventDefault()
      select(suggestions[activeIdx])
    } else if (e.key === 'Escape') {
      setOpen(false)
      setSuggestions([])
    }
  }

  return (
    <div>
      {/* role=combobox: o papel textbox implicito nao suporta aria-expanded */}
      <input
        type="text"
        role="combobox"
        className="input text-lg h-12"
        placeholder="Ex: Tóquio, Japão"
        value={query}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onBlur={() => setTimeout(() => { setOpen(false) }, 150)}
        onFocus={() => suggestions.length > 0 && setOpen(true)}
        autoFocus
        maxLength={100}
        autoComplete="off"
        aria-autocomplete="list"
        aria-expanded={showSuggestions}
        aria-controls="sugestoes-destino"
        aria-activedescendant={activeIdx >= 0 ? `sugestao-${activeIdx}` : undefined}
      />

      {/* Suggestions replace the hint text — in normal flow, never overflow the card */}
      {showSuggestions ? (
        <ul
          className="mt-1.5 rounded-xl overflow-hidden"
          style={{ border: '1px solid var(--border)' }}
          role="listbox"
          id="sugestoes-destino"
        >
          {loading ? (
            <li className="px-4 py-3 text-sm" style={{ color: 'var(--text-muted)' }}>
              A pesquisar…
            </li>
          ) : (
            suggestions.map((s, i) => (
              <li
                key={i}
                id={`sugestao-${i}`}
                role="option"
                aria-selected={i === activeIdx}
                className="px-4 py-2.5 text-sm cursor-pointer flex items-center gap-2.5"
                style={{
                  color: 'var(--text-primary)',
                  background: i === activeIdx ? 'var(--surface2)' : 'var(--bg-card)',
                  borderTop: i > 0 ? '1px solid var(--border)' : undefined,
                }}
                onMouseDown={() => select(s)}
                onMouseEnter={() => setActiveIdx(i)}
              >
                <MapPin className="w-3.5 h-3.5 shrink-0" style={{ color: 'var(--text-muted)' }} />
                {s}
              </li>
            ))
          )}
        </ul>
      ) : (
        <p className="text-xs mt-2" style={{ color: 'var(--text-muted)' }}>
          Podes indicar cidade, região ou país.
        </p>
      )}
    </div>
  )
}

// ─── Main component ────────────────────────────────────────────────────────

const DRAFT_KEY = 'memovoy-wizard-draft'

function loadDraft(): WizardData {
  try {
    const raw = localStorage.getItem(DRAFT_KEY)
    if (raw) return { ...defaultData(), ...JSON.parse(raw) }
  } catch { /* ignore */ }
  return defaultData()
}

function defaultData(): WizardData {
  return {
    destination: '',
    startDate: '',
    endDate: '',
    groupType: 'solo',
    travelStyle: [],
    mealsIncluded: [],
    transport: ['plane'],
    extras: [],
    budget: 1000,
    dayStart: HORA_INICIO_OMISSAO,
    dayEnd: HORA_FIM_OMISSAO,
  }
}

export default function NewItineraryPage() {
  const router = useRouter()
  const { isReady } = useRequireAuth()

  const [step, setStep] = useState(0)
  const [error, setError] = useState('')
  const [generating, setGenerating] = useState(false)
  const [generatingDays, setGeneratingDays] = useState<unknown[]>([])
  const [generatingStatus, setGeneratingStatus] = useState('')
  const [generatingSummary, setGeneratingSummary] = useState('')
  const [generatingCost, setGeneratingCost] = useState('')
  const [loadingStep, setLoadingStep] = useState(0)
  const [generatedId, setGeneratedId] = useState<string | null>(null)

  const [data, setData] = useState<WizardData>(defaultData)

  // Rascunho guardado, restaurado depois da hidratação.
  //
  // Excepção deliberada ao set-state-in-effect. As outras ocorrências foram
  // resolvidas com useSyncExternalStore, mas aqui não serve: `data` é estado
  // editável, alterado por funções de actualização em seis sítios, e um
  // snapshot externo não pode ser escrito. Ler o localStorage num inicializador
  // lazy também não serve — o servidor renderizaria defaultData e o cliente o
  // rascunho, o que é um mismatch de hidratação. Um render extra é o preço
  // certo a pagar.
  useEffect(() => {
    const draft = loadDraft()
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (draft.destination) setData(draft)
  }, [])

  const { data: durationHint } = useQuery<{ minDays: number; maxDays: number; idealDays: number; reasoning: string }>({
    queryKey: ['duration-hint', data.destination, data.groupType],
    queryFn: () => api.post('/itineraries/recommend-duration', {
      destination: data.destination,
      groupType: data.groupType || 'couple',
      travelStyle: data.travelStyle,
    }),
    enabled: step === 1 && data.destination.trim().length >= 2,
    staleTime: 10 * 60 * 1000,
  })

  // Save draft whenever data changes
  useEffect(() => {
    try { localStorage.setItem(DRAFT_KEY, JSON.stringify(data)) } catch { /* ignore */ }
  }, [data])

  function toggleMulti(field: 'travelStyle' | 'mealsIncluded' | 'transport' | 'extras', val: string) {
    setData((d) => ({
      ...d,
      [field]: d[field].includes(val)
        ? d[field].filter((v) => v !== val)
        : [...d[field], val],
    }))
  }

  const canProceed = useCallback(() => {
    switch (step) {
      case 0: return data.destination.trim().length >= 2
      case 1: return !!data.startDate && !!data.endDate && data.endDate >= data.startDate
                     && problemaDaJanela(data.dayStart, data.dayEnd) === null
      case 2: return !!data.groupType
      case 3: return data.travelStyle.length > 0
      default: return true
    }
  }, [step, data])

  async function generate() {
    setGenerating(true)
    setGeneratingDays([])
    setGeneratingStatus('A iniciar…')
    setLoadingStep(0)

    const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000'
    const token   = (await import('@/lib/api')).getAccessToken()

    try {
      const res = await fetch(`${API_URL}/itineraries/generate-stream`, {
        method:  'POST',
        headers: {
          'Content-Type':  'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify(data),
      })

      if (!res.ok || !res.body) throw new Error('Erro ao iniciar geração.')

      const reader  = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { value, done } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const parts = buffer.split('\n\n')
        buffer = parts.pop() ?? ''

        for (const part of parts) {
          const eventLine = part.split('\n').find((l) => l.startsWith('event:'))
          const dataLine  = part.split('\n').find((l) => l.startsWith('data:'))
          if (!eventLine || !dataLine) continue

          const event   = eventLine.replace('event:', '').trim()
          const payload = JSON.parse(dataLine.replace('data:', '').trim())

          if (event === 'status') {
            setGeneratingStatus(payload.message)
            setLoadingStep((s) => Math.min(s + 1, LOADING_STEPS.length - 1))
            if (payload.summary) setGeneratingSummary(payload.summary)
            if (payload.totalEstimatedCost) setGeneratingCost(payload.totalEstimatedCost)
          } else if (event === 'day') {
            setGeneratingDays((prev) => [...prev, payload.day])
          } else if (event === 'done') {
            try { localStorage.removeItem(DRAFT_KEY) } catch { /* ignore */ }
            setGeneratedId(payload.id)
            setGenerating(false)
            return
          } else if (event === 'error') {
            throw new Error(payload.message)
          }
        }
      }
    } catch (err: unknown) {
      setGenerating(false)
      setError(err instanceof Error ? err.message : 'Erro ao gerar roteiro. Tenta novamente.')
    }
  }

  // O estado de "a descartar" vive no ecrã de revisão, que é quem tem o botão
  // e quem mostra o spinner. Ter uma segunda cópia aqui era uma que podia ficar
  // dessincronizada da outra sem ninguém dar por isso.
  async function discard() {
    if (!generatedId) return
    try { await api.delete(`/itineraries/${generatedId}`) } catch { /* ignore */ }
    setGeneratedId(null)
    setGeneratingDays([])
    setGeneratingSummary('')
    setGeneratingCost('')
    setGeneratingStatus('')
    setError('')
    setStep(0)
  }

  if (!isReady) return null

  if (generating) {
    return (
      <div className="py-8">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <div className="relative w-10 h-10 shrink-0">
            <div className="spinner w-10 h-10" />
            <Sparkles className="absolute inset-0 m-auto w-5 h-5" style={{ color: 'var(--accent)' }} />
          </div>
          <div>
            <p className="font-bold" style={{ color: 'var(--text-primary)' }}>
              A criar o teu roteiro com IA
            </p>
            <p className="text-sm" style={{ color: 'var(--accent)' }}>
              {generatingStatus || data.destination}
            </p>
          </div>
        </div>

        {/* Days revealed progressively */}
        {(generatingDays as Array<{ day: number; date: string; theme: string; activities: Array<{ time: string; name: string; type: string }> }>).length > 0 && (
          <div className="flex flex-col gap-3 mb-6">
            {(generatingDays as Array<{ day: number; date: string; theme: string; activities: Array<{ time: string; name: string; type: string }> }>).map((d) => (
              <div
                key={d.day}
                className="rounded-xl p-4 border"
                style={{ background: 'var(--bg-card)', borderColor: 'var(--border)', animation: 'fadeInUp .35s ease' }}
              >
                <p className="text-xs font-bold uppercase tracking-wide mb-2" style={{ color: 'var(--accent)' }}>
                  Dia {d.day} · {d.theme}
                </p>
                <div className="flex flex-col gap-1">
                  {d.activities?.slice(0, 3).map((a, i) => (
                    <p key={i} className="text-xs" style={{ color: 'var(--text-muted)' }}>
                      {a.time} — {a.name}
                    </p>
                  ))}
                  {d.activities?.length > 3 && (
                    <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                      +{d.activities.length - 3} actividades…
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Summary preview — appears once AI returns it */}
        {(generatingSummary || generatingCost) && (
          <div
            className="rounded-xl p-4 border mb-4"
            style={{ background: 'var(--bg-card)', borderColor: 'var(--accent)', animation: 'fadeInUp .35s ease' }}
          >
            {generatingSummary && (
              <p className="text-sm mb-2" style={{ color: 'var(--text-primary)' }}>{generatingSummary}</p>
            )}
            {generatingCost && (
              <p className="text-xs font-semibold" style={{ color: 'var(--accent)' }}>
                Custo estimado: {generatingCost}
              </p>
            )}
          </div>
        )}

        {/* Step checklist */}
        <div className="flex flex-col gap-2">
          {LOADING_STEPS.map((s, i) => (
            <div key={i} className="flex items-center gap-2.5">
              {i < loadingStep ? (
                <Check className="w-4 h-4 shrink-0" style={{ color: 'var(--success)' }} />
              ) : i === loadingStep ? (
                <Loader2 className="w-4 h-4 shrink-0 animate-spin" style={{ color: 'var(--accent)' }} />
              ) : (
                <Clock className="w-4 h-4 shrink-0 opacity-30" style={{ color: 'var(--text-muted)' }} />
              )}
              <span className="text-sm" style={{ color: i <= loadingStep ? 'var(--text-primary)' : 'var(--text-muted)' }}>
                {s}
              </span>
            </div>
          ))}
        </div>
      </div>
    )
  }

  if (generatedId) {
    return (
      <RevisaoDoRoteiro
        roteiroId={generatedId}
        dias={generatingDays as Day[]}
        resumo={generatingSummary}
        custoEstimado={generatingCost}
        aoDescartar={discard}
      />
    )
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center gap-3 mb-4">
        <Compass className="w-5 h-5" style={{ color: 'var(--accent)' }} />
        <h1 className="font-bold text-lg" style={{ color: 'var(--text-primary)' }}>
          Criar Roteiro
        </h1>
        <span className="ml-auto text-xs font-medium" style={{ color: 'var(--text-muted)' }}>
          {step + 1} / {STEPS.length}
        </span>
      </div>

      <ProgressBar step={step} />

      {error && <div className="mb-4"><AlertBanner variant="danger" message={error} /></div>}

      {/* Step content */}
      <div className="card p-5 mb-4 min-h-[300px]">
        <h2 className="text-base font-bold mb-4" style={{ color: 'var(--text-primary)' }}>
          {step === 0 && 'Para onde queres ir?'}
          {step === 1 && 'Quando viajas?'}
          {step === 2 && 'Com quem viajas?'}
          {step === 3 && 'Qual o teu estilo de viagem?'}
          {step === 4 && 'Que refeições incluímos?'}
          {step === 5 && 'Como te vais deslocar?'}
          {step === 6 && 'Interesses especiais?'}
        </h2>

        {/* Step 0 — Destination */}
        {step === 0 && (
          <DestinationInput
            value={data.destination}
            onChange={(val) => setData((d) => ({ ...d, destination: val }))}
          />
        )}

        {/* Step 1 — Dates */}
        {step === 1 && (
          <>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label flex items-center gap-1">
                <Sun className="w-3 h-3" /> Partida
              </label>
              <input
                type="date"
                className="input"
                value={data.startDate}
                min={new Date().toISOString().slice(0, 10)}
                onChange={(e) => setData((d) => ({ ...d, startDate: e.target.value }))}
              />
            </div>
            <div>
              <label className="label flex items-center gap-1">
                <Moon className="w-3 h-3" /> Regresso
              </label>
              <input
                type="date"
                className="input"
                value={data.endDate}
                min={data.startDate || new Date().toISOString().slice(0, 10)}
                onChange={(e) => setData((d) => ({ ...d, endDate: e.target.value }))}
              />
            </div>
          </div>

          {/* A que horas corre cada dia */}
          <div className="mt-5 pt-4" style={{ borderTop: '1px solid var(--border)' }}>
            <p className="label mb-1">A que horas queres andar na rua?</p>
            <p className="text-xs mb-3" style={{ color: 'var(--text-muted)' }}>
              Aplica-se a todos os dias. O roteiro é planeado dentro desta janela.
            </p>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label flex items-center gap-1" htmlFor="hora-inicio">
                  <Sunrise className="w-3 h-3" /> Começar
                </label>
                <input
                  id="hora-inicio"
                  type="time"
                  className="input"
                  value={data.dayStart}
                  onChange={(e) => setData((d) => ({ ...d, dayStart: e.target.value }))}
                />
              </div>
              <div>
                <label className="label flex items-center gap-1" htmlFor="hora-fim">
                  <Sunset className="w-3 h-3" /> Terminar
                </label>
                <input
                  id="hora-fim"
                  type="time"
                  className="input"
                  value={data.dayEnd}
                  onChange={(e) => setData((d) => ({ ...d, dayEnd: e.target.value }))}
                />
              </div>
            </div>

            {/* O erro tem prioridade sobre a confirmação: se a janela não
                serve, dizer quanto tempo tem seria confirmar um disparate. */}
            {problemaDaJanela(data.dayStart, data.dayEnd) ? (
              <p className="text-xs mt-2" style={{ color: 'var(--danger)' }}>
                {problemaDaJanela(data.dayStart, data.dayEnd)}
              </p>
            ) : (
              <p className="text-xs mt-2" style={{ color: 'var(--text-muted)' }}>
                {duracaoLegivel(data.dayStart, data.dayEnd)} por dia para actividades.
              </p>
            )}
          </div>

          {/* AI duration recommendation */}
          {durationHint && (
            <div
              className="mt-3 flex items-start gap-2 rounded-xl p-3 text-sm"
              style={{ background: 'rgba(34,152,206,0.08)', border: '1px solid rgba(34,152,206,0.2)' }}
            >
              <Sparkles className="w-3.5 h-3.5 mt-0.5 shrink-0" style={{ color: 'var(--accent)' }} />
              <div>
                <span className="font-semibold" style={{ color: 'var(--text-primary)' }}>
                  Sugestão: {durationHint.idealDays} dias
                </span>
                <span className="ml-1" style={{ color: 'var(--text-muted)' }}>
                  ({durationHint.minDays}–{durationHint.maxDays} dias)
                </span>
                <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>
                  {durationHint.reasoning}
                </p>
              </div>
            </div>
          )}
          </>
        )}

        {/* Step 2 — Group */}
        {step === 2 && (
          <div className="grid grid-cols-2 gap-3">
            {GROUP_OPTIONS.map((o) => (
              <OptionCard
                key={o.value}
                emoji={o.emoji}
                label={o.label}
                active={data.groupType === o.value}
                onClick={() => setData((d) => ({ ...d, groupType: o.value }))}
              />
            ))}
          </div>
        )}

        {/* Step 3 — Style (multi) */}
        {step === 3 && (
          <div className="grid grid-cols-2 gap-3">
            {STYLE_OPTIONS.map((o) => (
              <OptionCard
                key={o.value}
                emoji={o.emoji}
                label={o.label}
                active={data.travelStyle.includes(o.value)}
                onClick={() => toggleMulti('travelStyle', o.value)}
                multi
              />
            ))}
          </div>
        )}

        {/* Step 4 — Meals (multi) */}
        {step === 4 && (
          <div className="grid grid-cols-3 gap-3">
            {MEAL_OPTIONS.map((o) => (
              <OptionCard
                key={o.value}
                emoji={o.emoji}
                label={o.label}
                active={data.mealsIncluded.includes(o.value)}
                onClick={() => toggleMulti('mealsIncluded', o.value)}
                multi
              />
            ))}
          </div>
        )}

        {/* Step 5 — Transport (multi) */}
        {step === 5 && (
          <div className="grid grid-cols-3 gap-3">
            {TRANSPORT_OPTIONS.map((o) => (
              <OptionCard
                key={o.value}
                emoji={o.emoji}
                label={o.label}
                active={data.transport.includes(o.value)}
                onClick={() => toggleMulti('transport', o.value)}
                multi
              />
            ))}
          </div>
        )}

        {/* Step 6 — Extras + budget (multi) */}
        {step === 6 && (
          <div>
            <div className="grid grid-cols-3 gap-3 mb-5">
              {EXTRA_OPTIONS.map((o) => (
                <OptionCard
                  key={o.value}
                  emoji={o.emoji}
                  label={o.label}
                  active={data.extras.includes(o.value)}
                  onClick={() => toggleMulti('extras', o.value)}
                  multi
                />
              ))}
            </div>

            <div>
              <label className="label flex items-center gap-2">
                <Car className="w-3.5 h-3.5" />
                Orçamento estimado: <strong style={{ color: 'var(--accent)' }}>€{data.budget}</strong>
              </label>
              <input
                type="range"
                min={100}
                max={10000}
                step={100}
                value={data.budget}
                onChange={(e) => setData((d) => ({ ...d, budget: +e.target.value }))}
                className="w-full accent-[color:var(--accent)]"
              />
              <div className="flex justify-between text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
                <span>€100</span><span>€10.000</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Navigation */}
      <div className="flex gap-3">
        {step > 0 && (
          <button
            onClick={() => setStep((s) => s - 1)}
            className="btn btn-secondary gap-1.5"
          >
            <ChevronLeft className="w-4 h-4" /> Atrás
          </button>
        )}

        {step < STEPS.length - 1 ? (
          <button
            onClick={() => setStep((s) => s + 1)}
            disabled={!canProceed()}
            className="btn btn-primary flex-1 gap-1.5"
          >
            Continuar <ChevronRight className="w-4 h-4" />
          </button>
        ) : (
          <button
            onClick={generate}
            className="btn btn-primary flex-1 gap-2"
          >
            <Sparkles className="w-4 h-4" />
            Gerar Roteiro com IA
          </button>
        )}
      </div>

      {/* Manual builder link */}
      <p className="text-center text-xs mt-4" style={{ color: 'var(--text-muted)' }}>
        Preferes criar manualmente?{' '}
        <button
          onClick={() => router.push('/itineraries/new/manual')}
          className="underline hover:opacity-80"
          style={{ color: 'var(--accent)' }}
        >
          Construtor manual
        </button>
      </p>
    </div>
  )
}

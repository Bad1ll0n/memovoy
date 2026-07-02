// src/app/itineraries/new/page.tsx
'use client'

import Link              from 'next/link'
import { useRouter }     from 'next/navigation'
import { useState }      from 'react'
import { useMutation }   from '@tanstack/react-query'
import { useAuthStore }  from '@/store/auth'
import { api }           from '@/lib/api-client'
import { NavBar }        from '@/components/layout/NavBar'
import { cn }            from '@/lib/utils'
import type { Itinerary } from '@/types'

// ---------------------------------------------------------------------------
// Estado do wizard
// ---------------------------------------------------------------------------

interface WizardState {
  destinationName:     string
  countryCode:         string
  startDate:           string
  endDate:             string
  groupType:           string
  groupSize:           number
  transportModes:      string[]
  pacePreference:      string
  accommodationType:   string | null
  budgetPerDay:        number | null
  travelStyles:        string[]
  mustSeeAttractions:  string[]
  avoidCategories:     string[]
  dietaryRestrictions: string[]
  visibility:          string
  language:            string
}

function defaultState(): WizardState {
  const today = new Date()
  const start = new Date(today.getTime() + 7 * 86400000)
  const end   = new Date(today.getTime() + 14 * 86400000)
  const fmt   = (d: Date) => d.toISOString().split('T')[0]
  return {
    destinationName:     '',
    countryCode:         'PT',
    startDate:           fmt(start),
    endDate:             fmt(end),
    groupType:           'solo',
    groupSize:           1,
    transportModes:      ['public'],
    pacePreference:      'moderate',
    accommodationType:   null,
    budgetPerDay:        null,
    travelStyles:        [],
    mustSeeAttractions:  [],
    avoidCategories:     [],
    dietaryRestrictions: [],
    visibility:          'public',
    language:            'pt-PT',
  }
}

function durationDays(start: string, end: string) {
  const ms = new Date(end).getTime() - new Date(start).getTime()
  return Math.max(1, Math.round(ms / 86400000) + 1)
}

// ---------------------------------------------------------------------------
// Componentes de etapa reutilizáveis
// ---------------------------------------------------------------------------

function StepHeader({ icon, title, subtitle }: { icon: string; title: string; subtitle: string }) {
  return (
    <div className="mb-8">
      <span className="text-4xl mb-3 block">{icon}</span>
      <h2 className="font-display text-2xl font-bold text-ink mb-1">{title}</h2>
      <p className="text-ink-secondary text-sm">{subtitle}</p>
    </div>
  )
}

function ToggleChip({
  label, selected, onClick,
}: { label: string; selected: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'px-4 py-2 rounded-full text-sm font-medium transition-colors border',
        selected
          ? 'bg-blue text-white border-blue'
          : 'bg-surface text-ink-secondary border-surface-muted hover:border-blue/40 hover:text-blue'
      )}
    >
      {label}
    </button>
  )
}

// ---------------------------------------------------------------------------
// Etapas
// ---------------------------------------------------------------------------

const POPULAR_COUNTRIES = [
  { code: 'PT', name: 'Portugal',  flag: '🇵🇹' },
  { code: 'BR', name: 'Brasil',    flag: '🇧🇷' },
  { code: 'JP', name: 'Japão',     flag: '🇯🇵' },
  { code: 'IT', name: 'Itália',    flag: '🇮🇹' },
  { code: 'FR', name: 'França',    flag: '🇫🇷' },
  { code: 'ES', name: 'Espanha',   flag: '🇪🇸' },
  { code: 'TH', name: 'Tailândia', flag: '🇹🇭' },
  { code: 'GR', name: 'Grécia',    flag: '🇬🇷' },
  { code: 'US', name: 'EUA',       flag: '🇺🇸' },
  { code: 'MX', name: 'México',    flag: '🇲🇽' },
]

function Step1({ state, set }: { state: WizardState; set: (u: Partial<WizardState>) => void }) {
  return (
    <div>
      <StepHeader icon="🗺" title="Para onde vais?" subtitle="Escolhe o destino da tua próxima aventura." />
      <div className="space-y-6">
        <div>
          <label className="block text-sm font-medium text-ink mb-1.5">Cidade ou região</label>
          <input
            type="text"
            value={state.destinationName}
            onChange={(e) => set({ destinationName: e.target.value })}
            placeholder="Ex: Tokyo, Lisboa, Bali…"
            className="input"
          />
        </div>
        <div>
          <p className="text-sm font-medium text-ink mb-3">Destinos populares</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {POPULAR_COUNTRIES.map((c) => (
              <button
                key={c.code}
                type="button"
                onClick={() => set({ countryCode: c.code, destinationName: state.destinationName || c.name })}
                className={cn(
                  'flex items-center gap-2 px-3 py-2.5 rounded-lg border text-sm transition-colors',
                  state.countryCode === c.code
                    ? 'border-blue bg-blue/5 text-blue font-medium'
                    : 'border-surface-muted bg-surface text-ink hover:border-blue/30'
                )}
              >
                <span className="text-lg">{c.flag}</span>
                {c.name}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

function Step2({ state, set }: { state: WizardState; set: (u: Partial<WizardState>) => void }) {
  const days = durationDays(state.startDate, state.endDate)
  return (
    <div>
      <StepHeader icon="📅" title="Quando viajas?" subtitle="Define as datas de partida e regresso." />
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-ink mb-1.5">Partida</label>
            <input
              type="date"
              value={state.startDate}
              min={new Date().toISOString().split('T')[0]}
              onChange={(e) => set({ startDate: e.target.value })}
              className="input"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-ink mb-1.5">Regresso</label>
            <input
              type="date"
              value={state.endDate}
              min={state.startDate}
              onChange={(e) => set({ endDate: e.target.value })}
              className="input"
            />
          </div>
        </div>
        <div className={cn(
          'flex items-center gap-3 p-4 rounded-xl',
          days > 21 ? 'bg-amber/10' : 'bg-blue/5'
        )}>
          <span className="text-2xl">{days > 21 ? '⚠️' : '🌙'}</span>
          <div>
            <p className="font-semibold text-ink text-sm">
              {days} {days === 1 ? 'dia' : 'dias'} de viagem
            </p>
            {days > 21 && (
              <p className="text-amber-700 text-xs mt-0.5">Máximo 21 dias por roteiro com IA</p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

const GROUP_TYPES = [
  { type: 'solo',    label: 'Solo',    icon: '🧳' },
  { type: 'couple',  label: 'Casal',   icon: '💑' },
  { type: 'friends', label: 'Amigos',  icon: '👫' },
  { type: 'family',  label: 'Família', icon: '👨‍👩‍👧' },
]
const TRANSPORTS = [
  { mode: 'walking', label: 'A pé'       },
  { mode: 'public',  label: 'Público'    },
  { mode: 'car',     label: 'Carro'      },
  { mode: 'bicycle', label: 'Bicicleta'  },
  { mode: 'taxi',    label: 'Táxi'       },
  { mode: 'tour',    label: 'Tour'       },
]

function Step3({ state, set }: { state: WizardState; set: (u: Partial<WizardState>) => void }) {
  function toggleTransport(mode: string) {
    const modes = state.transportModes.includes(mode)
      ? state.transportModes.filter((m) => m !== mode)
      : [...state.transportModes, mode]
    set({ transportModes: modes.length ? modes : [mode] })
  }

  return (
    <div>
      <StepHeader icon="👥" title="Com quem viajas?" subtitle="Tipo de grupo e meios de transporte." />
      <div className="space-y-6">
        <div>
          <p className="text-sm font-medium text-ink mb-3">Tipo de grupo</p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {GROUP_TYPES.map(({ type, label, icon }) => (
              <button
                key={type}
                type="button"
                onClick={() => set({ groupType: type, groupSize: type === 'solo' ? 1 : Math.max(2, state.groupSize) })}
                className={cn(
                  'flex flex-col items-center gap-1.5 py-4 rounded-xl border text-sm transition-colors',
                  state.groupType === type
                    ? 'border-blue bg-blue/5 text-blue font-semibold'
                    : 'border-surface-muted bg-surface text-ink hover:border-blue/30'
                )}
              >
                <span className="text-2xl">{icon}</span>
                {label}
              </button>
            ))}
          </div>
        </div>

        {state.groupType !== 'solo' && (
          <div>
            <label className="block text-sm font-medium text-ink mb-1.5">
              Tamanho do grupo
            </label>
            <div className="flex items-center gap-4">
              <button type="button" onClick={() => set({ groupSize: Math.max(2, state.groupSize - 1) })}
                className="w-9 h-9 rounded-full bg-surface-muted flex items-center justify-center text-lg font-bold hover:bg-surface-subtle transition-colors">−</button>
              <span className="text-xl font-bold text-ink w-8 text-center">{state.groupSize}</span>
              <button type="button" onClick={() => set({ groupSize: Math.min(20, state.groupSize + 1) })}
                className="w-9 h-9 rounded-full bg-surface-muted flex items-center justify-center text-lg font-bold hover:bg-surface-subtle transition-colors">+</button>
              <span className="text-ink-secondary text-sm">pessoas</span>
            </div>
          </div>
        )}

        <div>
          <p className="text-sm font-medium text-ink mb-3">Transportes (selecciona todos)</p>
          <div className="flex flex-wrap gap-2">
            {TRANSPORTS.map(({ mode, label }) => (
              <ToggleChip
                key={mode}
                label={label}
                selected={state.transportModes.includes(mode)}
                onClick={() => toggleTransport(mode)}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

const PACES    = [
  { val: 'relaxed',   label: '🐢 Relaxado',  desc: 'Menos actividades, mais tempo em cada lugar'  },
  { val: 'moderate',  label: '🚶 Moderado',  desc: 'Equilíbrio entre explorar e descansar'         },
  { val: 'intensive', label: '🐇 Intensivo', desc: 'Aproveitar ao máximo cada hora do dia'          },
]
const ACCOMS   = ['Hotel','Airbnb','Hostel','Boutique']
const STYLES   = ['Cultura','Gastronomia','Aventura','Natureza','Praias','Museus','Compras','Nightlife']

function Step4({ state, set }: { state: WizardState; set: (u: Partial<WizardState>) => void }) {
  return (
    <div>
      <StepHeader icon="⚡" title="Ritmo e conforto" subtitle="Como preferes organizar os teus dias?" />
      <div className="space-y-6">
        <div>
          <p className="text-sm font-medium text-ink mb-3">Ritmo da viagem</p>
          <div className="space-y-2">
            {PACES.map(({ val, label, desc }) => (
              <button
                key={val}
                type="button"
                onClick={() => set({ pacePreference: val })}
                className={cn(
                  'w-full flex items-center gap-3 px-4 py-3 rounded-xl border text-left transition-colors',
                  state.pacePreference === val
                    ? 'border-blue bg-blue/5'
                    : 'border-surface-muted bg-surface hover:border-blue/30'
                )}
              >
                <span className={cn(
                  'w-4 h-4 rounded-full border-2 shrink-0 transition-colors',
                  state.pacePreference === val ? 'border-blue bg-blue' : 'border-surface-muted'
                )} />
                <div>
                  <p className={cn('text-sm font-medium', state.pacePreference === val ? 'text-blue' : 'text-ink')}>{label}</p>
                  <p className="text-xs text-ink-secondary">{desc}</p>
                </div>
              </button>
            ))}
          </div>
        </div>

        <div>
          <p className="text-sm font-medium text-ink mb-3">Alojamento (opcional)</p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {ACCOMS.map((a) => {
              const val = a.toLowerCase()
              return (
                <ToggleChip
                  key={val}
                  label={a}
                  selected={state.accommodationType === val}
                  onClick={() => set({ accommodationType: state.accommodationType === val ? null : val })}
                />
              )
            })}
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-ink mb-1.5">Orçamento por dia (€, opcional)</label>
          <input
            type="number"
            min={0}
            value={state.budgetPerDay ? state.budgetPerDay / 100 : ''}
            onChange={(e) => set({ budgetPerDay: e.target.value ? Math.round(parseFloat(e.target.value) * 100) : null })}
            placeholder="Ex: 100"
            className="input"
          />
        </div>
      </div>
    </div>
  )
}

function Step5({ state, set }: { state: WizardState; set: (u: Partial<WizardState>) => void }) {
  const [newAttr, setNewAttr] = useState('')

  function toggleStyle(s: string) {
    const lower = s.toLowerCase()
    set({
      travelStyles: state.travelStyles.includes(lower)
        ? state.travelStyles.filter((x) => x !== lower)
        : [...state.travelStyles, lower],
    })
  }

  function addAttraction() {
    const a = newAttr.trim()
    if (!a || state.mustSeeAttractions.length >= 5) return
    set({ mustSeeAttractions: [...state.mustSeeAttractions, a] })
    setNewAttr('')
  }

  return (
    <div>
      <StepHeader icon="❤️" title="O que adoras?" subtitle="Personaliza o roteiro às tuas preferências." />
      <div className="space-y-6">
        <div>
          <p className="text-sm font-medium text-ink mb-3">Estilo de viagem</p>
          <div className="flex flex-wrap gap-2">
            {STYLES.map((s) => (
              <ToggleChip
                key={s}
                label={s}
                selected={state.travelStyles.includes(s.toLowerCase())}
                onClick={() => toggleStyle(s)}
              />
            ))}
          </div>
        </div>

        <div>
          <p className="text-sm font-medium text-ink mb-1.5">
            Obrigatório visitar{' '}
            <span className="text-ink-tertiary font-normal">({state.mustSeeAttractions.length}/5)</span>
          </p>
          <div className="flex gap-2">
            <input
              type="text"
              value={newAttr}
              onChange={(e) => setNewAttr(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addAttraction() } }}
              placeholder="Ex: Torre Eiffel"
              className="input flex-1"
              disabled={state.mustSeeAttractions.length >= 5}
            />
            <button
              type="button"
              onClick={addAttraction}
              disabled={!newAttr.trim() || state.mustSeeAttractions.length >= 5}
              className="btn-primary px-4 py-2 text-sm"
            >
              Adicionar
            </button>
          </div>
          {state.mustSeeAttractions.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-3">
              {state.mustSeeAttractions.map((a) => (
                <span
                  key={a}
                  className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue/8 text-blue text-sm"
                >
                  {a}
                  <button
                    type="button"
                    onClick={() => set({ mustSeeAttractions: state.mustSeeAttractions.filter((x) => x !== a) })}
                    className="text-blue/60 hover:text-blue transition-colors"
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function Step6({ state, set }: { state: WizardState; set: (u: Partial<WizardState>) => void }) {
  const days = durationDays(state.startDate, state.endDate)
  const fmt  = (d: string) => new Intl.DateTimeFormat('pt-PT', { day: 'numeric', month: 'short' }).format(new Date(d))

  return (
    <div>
      <StepHeader icon="✅" title="Tudo pronto!" subtitle="Revê o resumo e escolhe a visibilidade do roteiro." />
      <div className="space-y-5">
        {/* Resumo */}
        <div className="card p-5 space-y-3 text-sm">
          {[
            { icon: '📍', label: 'Destino',   value: `${state.destinationName} (${state.countryCode})` },
            { icon: '📅', label: 'Datas',     value: `${fmt(state.startDate)} → ${fmt(state.endDate)} · ${days} dias` },
            { icon: '👥', label: 'Grupo',     value: `${state.groupType} · ${state.groupSize} pessoa(s)` },
            { icon: '⚡', label: 'Ritmo',     value: state.pacePreference },
            ...(state.travelStyles.length ? [{ icon: '❤️', label: 'Estilos', value: state.travelStyles.join(', ') }] : []),
          ].map(({ icon, label, value }) => (
            <div key={label} className="flex items-baseline gap-3">
              <span className="shrink-0 w-5 text-center">{icon}</span>
              <span className="text-ink-secondary w-16 shrink-0">{label}</span>
              <span className="text-ink font-medium capitalize">{value}</span>
            </div>
          ))}
        </div>

        {/* Visibilidade */}
        <div>
          <p className="text-sm font-medium text-ink mb-3">Visibilidade</p>
          <div className="grid grid-cols-3 gap-2">
            {['public','followers','private'].map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => set({ visibility: v })}
                className={cn(
                  'py-2.5 rounded-lg border text-sm font-medium transition-colors',
                  state.visibility === v
                    ? 'border-blue bg-blue/5 text-blue'
                    : 'border-surface-muted bg-surface text-ink-secondary hover:border-blue/30'
                )}
              >
                {{ public: '🌍 Público', followers: '👥 Seguidores', private: '🔒 Privado' }[v]}
              </button>
            ))}
          </div>
        </div>

        <div className="p-4 rounded-xl bg-blue/5 text-sm text-ink-secondary leading-relaxed">
          ✨ A IA vai criar um roteiro completo com actividades, horários, estimativas de preço e avisos práticos. Podes editar tudo depois.
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Wizard principal
// ---------------------------------------------------------------------------

const STEPS = [Step1, Step2, Step3, Step4, Step5, Step6]
const TOTAL  = STEPS.length

export default function NewItineraryPage() {
  const { isAuthenticated } = useAuthStore()
  const router = useRouter()
  const [step,  setStep]  = useState(1)
  const [state, setState] = useState<WizardState>(defaultState)
  const [error, setError] = useState<string | null>(null)

  function set(updates: Partial<WizardState>) {
    setState((s) => ({ ...s, ...updates }))
  }

  function canGoNext(): boolean {
    if (step === 1) return !!state.destinationName.trim() && state.countryCode.length === 2
    if (step === 2) {
      const days = durationDays(state.startDate, state.endDate)
      return state.endDate >= state.startDate && days <= 21
    }
    if (step === 3) return state.transportModes.length > 0
    return true
  }

  const generateMutation = useMutation({
    mutationFn: () => api.post<{ itinerary: Itinerary; meta: { usedFallback: boolean } }>(
      '/ai/generate',
      {
        destination:         { name: state.destinationName, countryCode: state.countryCode },
        startDate:           state.startDate,
        endDate:             state.endDate,
        groupType:           state.groupType,
        groupSize:           state.groupSize,
        transportModes:      state.transportModes,
        pacePreference:      state.pacePreference,
        accommodationType:   state.accommodationType,
        budgetPerDay:        state.budgetPerDay,
        travelStyles:        state.travelStyles,
        mustSeeAttractions:  state.mustSeeAttractions,
        avoidCategories:     state.avoidCategories,
        dietaryRestrictions: state.dietaryRestrictions,
        visibility:          state.visibility,
        language:            state.language,
      }
    ),
    onSuccess: (data) => {
      router.push(`/itineraries/${data.itinerary.id}`)
    },
    onError: (err: Error) => {
      setError(err.message ?? 'Erro na geração. Tenta novamente.')
    },
  })

  const StepComponent = STEPS[step - 1]

  return (
    <div className="min-h-screen bg-surface-subtle">
      <NavBar />

      <main className="max-w-xl mx-auto px-4 py-8 pb-32">
        {/* Barra de progresso */}
        <div className="mb-8">
          <div className="flex items-center justify-between text-xs text-ink-secondary mb-2">
            <span>Passo {step} de {TOTAL}</span>
            <Link href="/itineraries" className="hover:text-blue transition-colors">Cancelar</Link>
          </div>
          <div className="h-1.5 bg-surface-muted rounded-full overflow-hidden">
            <div
              className="h-full bg-blue rounded-full transition-all duration-300 ease-out"
              style={{ width: `${(step / TOTAL) * 100}%` }}
            />
          </div>
        </div>

        {/* Etapa actual */}
        <div className="animate-fade-in">
          <StepComponent state={state} set={set} />
        </div>

        {/* Erro de geração */}
        {error && (
          <div className="mt-4 flex items-start gap-2 p-4 rounded-xl bg-red-50 text-red-700 text-sm">
            <span>⚠️</span>
            <p>{error}</p>
          </div>
        )}
      </main>

      {/* Navegação fixa no fundo */}
      <div className="fixed bottom-0 inset-x-0 bg-surface/95 backdrop-blur-md border-t border-surface-muted">
        <div className="max-w-xl mx-auto px-4 py-4 flex gap-3">
          {step > 1 ? (
            <button
              type="button"
              onClick={() => { setError(null); setStep(step - 1) }}
              className="btn-secondary flex-1"
            >
              ← Anterior
            </button>
          ) : (
            <div className="flex-1" />
          )}

          {step < TOTAL ? (
            <button
              type="button"
              onClick={() => { if (canGoNext()) setStep(step + 1) }}
              disabled={!canGoNext()}
              className="btn-primary flex-1"
            >
              Próximo →
            </button>
          ) : (
            <button
              type="button"
              onClick={() => { setError(null); generateMutation.mutate() }}
              disabled={generateMutation.isPending || !canGoNext()}
              className="btn-primary flex-1 text-base"
            >
              {generateMutation.isPending ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                  A gerar roteiro…
                </span>
              ) : '✨ Gerar com IA'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

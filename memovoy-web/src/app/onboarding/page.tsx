'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useQuery, useMutation } from '@tanstack/react-query'
import { Globe, Map, Users, ArrowRight, Check } from 'lucide-react'
import { api } from '@/lib/api'
import { useAuthStore } from '@/store/authStore'
import { Avatar } from '@/components/ui/Avatar'

const INTERESTS = [
  { id: 'adventure', label: 'Aventura', emoji: '🧗' },
  { id: 'culture',   label: 'Cultura',  emoji: '🏛️' },
  { id: 'food',      label: 'Gastronomia', emoji: '🍜' },
  { id: 'nature',    label: 'Natureza', emoji: '🌿' },
  { id: 'beach',     label: 'Praias',   emoji: '🏖️' },
  { id: 'city',      label: 'Cidades',  emoji: '🏙️' },
  { id: 'wellness',  label: 'Bem-estar', emoji: '🧘' },
  { id: 'history',   label: 'História', emoji: '🏰' },
  { id: 'budget',    label: 'Backpacking', emoji: '🎒' },
  { id: 'luxury',    label: 'Luxo',     emoji: '✨' },
]

interface SuggestedUser {
  id: string
  username: string
  displayName: string
  avatarUrl: string | null
  followersCount: number
  viewerFollows: boolean
}

export default function OnboardingPage() {
  const router = useRouter()
  const { user, setAuth } = useAuthStore()
  const [step, setStep] = useState(1)
  const [selectedInterests, setSelectedInterests] = useState<string[]>([])
  const [followedIds, setFollowedIds] = useState<Set<string>>(new Set())

  const { data: suggested } = useQuery<SuggestedUser[]>({
    queryKey: ['onboarding-suggested'],
    queryFn: () => api.get('/users/suggested?limit=6'),
    enabled: step === 2,
  })

  const followMutation = useMutation({
    mutationFn: (userId: string) => api.post(`/users/${userId}/follow`),
    onSuccess: (_, userId) => setFollowedIds((prev) => new Set([...prev, userId])),
  })

  const completeMutation = useMutation({
    mutationFn: () => api.post('/auth/complete-onboarding'),
    onSuccess: () => {
      if (user) {
        setAuth({ ...user, onboardingCompleted: true }, useAuthStore.getState().accessToken ?? '')
      }
      router.replace('/feed')
    },
  })

  const toggleInterest = (id: string) => {
    setSelectedInterests((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id],
    )
  }

  const steps = [
    { num: 1, label: 'Interesses', Icon: Globe },
    { num: 2, label: 'Seguir',     Icon: Users },
    { num: 3, label: 'Pronto!',    Icon: Map   },
  ]

  return (
    <div
      className="min-h-screen flex items-center justify-center p-4"
      style={{ background: 'var(--bg-body)' }}
    >
      <div className="w-full max-w-md">
        {/* Header */}
        <div className="text-center mb-8">
          <span
            className="text-2xl font-extrabold tracking-widest uppercase"
            style={{ color: 'var(--accent)' }}
          >
            Memovoy
          </span>
          <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>
            Olá, {user?.displayName ?? user?.username}! Vamos personalizar a tua experiência.
          </p>
        </div>

        {/* Step indicators */}
        <div className="flex items-center justify-center gap-2 mb-8">
          {steps.map((s, i) => (
            <div key={s.num} className="flex items-center gap-2">
              <div
                className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-colors"
                style={{
                  background: step >= s.num ? 'var(--accent)' : 'var(--surface)',
                  color:      step >= s.num ? 'var(--on-accent)' : 'var(--text-muted)',
                }}
              >
                {step > s.num ? <Check className="w-4 h-4" /> : s.num}
              </div>
              {i < steps.length - 1 && (
                <div
                  className="w-8 h-0.5 rounded-full transition-colors"
                  style={{ background: step > s.num ? 'var(--accent)' : 'var(--border)' }}
                />
              )}
            </div>
          ))}
        </div>

        {/* Step 1 — Interests */}
        {step === 1 && (
          <div>
            <h2 className="text-xl font-bold mb-1" style={{ color: 'var(--text-primary)' }}>
              O que gostas de explorar?
            </h2>
            <p className="text-sm mb-5" style={{ color: 'var(--text-muted)' }}>
              Escolhe pelo menos 3 interesses.
            </p>
            <div className="grid grid-cols-2 gap-2 mb-6">
              {INTERESTS.map((interest) => {
                const selected = selectedInterests.includes(interest.id)
                return (
                  <button
                    key={interest.id}
                    onClick={() => toggleInterest(interest.id)}
                    className="flex items-center gap-2 p-3 rounded-xl border text-left transition-all"
                    style={{
                      background:   selected ? 'var(--accent)' : 'var(--card-bg)',
                      borderColor:  selected ? 'var(--accent)' : 'var(--border)',
                      color:        selected ? 'var(--on-accent)' : 'var(--text-primary)',
                    }}
                  >
                    <span className="text-lg">{interest.emoji}</span>
                    <span className="text-sm font-medium">{interest.label}</span>
                  </button>
                )
              })}
            </div>
            <button
              onClick={() => setStep(2)}
              disabled={selectedInterests.length < 3}
              className="btn btn-primary w-full gap-2"
            >
              Continuar
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Step 2 — Follow people */}
        {step === 2 && (
          <div>
            <h2 className="text-xl font-bold mb-1" style={{ color: 'var(--text-primary)' }}>
              Segue outros viajantes
            </h2>
            <p className="text-sm mb-5" style={{ color: 'var(--text-muted)' }}>
              O teu feed começa aqui.
            </p>
            <div className="flex flex-col gap-2 mb-6">
              {(suggested ?? []).map((u) => (
                <div
                  key={u.id}
                  className="flex items-center gap-3 p-3 rounded-xl"
                  style={{ background: 'var(--card-bg)', border: '1px solid var(--border)' }}
                >
                  <Avatar src={u.avatarUrl} name={u.displayName} size="md" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold truncate" style={{ color: 'var(--text-primary)' }}>
                      {u.displayName}
                    </p>
                    <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                      @{u.username} · {u.followersCount} seguidores
                    </p>
                  </div>
                  <button
                    onClick={() => !followedIds.has(u.id) && followMutation.mutate(u.id)}
                    className="btn text-xs px-3 py-1.5 shrink-0"
                    style={{
                      background: followedIds.has(u.id) ? 'var(--surface)' : 'var(--accent)',
                      color:      followedIds.has(u.id) ? 'var(--text-muted)' : 'var(--on-accent)',
                    }}
                  >
                    {followedIds.has(u.id) ? 'A seguir' : 'Seguir'}
                  </button>
                </div>
              ))}
            </div>
            <button onClick={() => setStep(3)} className="btn btn-primary w-full gap-2">
              Continuar
              <ArrowRight className="w-4 h-4" />
            </button>
            <button
              onClick={() => setStep(3)}
              className="w-full text-center text-sm mt-3"
              style={{ color: 'var(--text-muted)' }}
            >
              Saltar
            </button>
          </div>
        )}

        {/* Step 3 — Done */}
        {step === 3 && (
          <div className="text-center">
            <div className="text-6xl mb-4">🗺️</div>
            <h2 className="text-2xl font-bold mb-2" style={{ color: 'var(--text-primary)' }}>
              Tudo pronto!
            </h2>
            <p className="text-sm mb-8" style={{ color: 'var(--text-muted)' }}>
              A tua conta está configurada. Começa a explorar roteiros, partilha as tuas viagens
              e deixa a IA planear a próxima aventura.
            </p>
            <button
              onClick={() => completeMutation.mutate()}
              disabled={completeMutation.isPending}
              className="btn btn-primary w-full gap-2"
            >
              Entrar no Memovoy
              <Map className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

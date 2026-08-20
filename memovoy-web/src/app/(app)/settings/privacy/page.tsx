'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Lock, Globe, CalendarClock, CalendarOff } from 'lucide-react'
import { api } from '@/lib/api'
import { useRequireAuth } from '@/hooks/useRequireAuth'
import { useAuthStore } from '@/store/authStore'
import { Spinner } from '@/components/ui/Spinner'
import { AlertBanner } from '@/components/ui/AlertBanner'
import type { AuthUser } from '@/store/authStore'

/** Fundo translúcido derivado do acento, para acompanhar o tema em vez de o
 *  contrariar. Estava aqui um laranja fixo, herdado da paleta antiga. */
const TINTA = 'color-mix(in srgb, var(--accent) 12%, transparent)'

function Interruptor({
  ligado, aoAlternar, aGravar, titulo, descricao, Icone, etiqueta,
}: {
  ligado: boolean
  aoAlternar: () => void
  aGravar: boolean
  titulo: string
  descricao: string
  Icone: typeof Lock
  etiqueta: string
}) {
  return (
    <div className="card p-4">
      <div className="flex items-start gap-4">
        <div
          className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
          style={{ background: TINTA }}
        >
          <Icone className="w-5 h-5" style={{ color: 'var(--accent)' }} />
        </div>

        <div className="flex-1">
          <p className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>
            {titulo}
          </p>
          <p className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>
            {descricao}
          </p>
        </div>

        <button
          onClick={aoAlternar}
          disabled={aGravar}
          className="relative w-11 h-6 rounded-full transition-colors shrink-0"
          style={{
            background: ligado ? 'var(--accent)' : 'var(--surface2)',
            border: '1px solid var(--border)',
          }}
          role="switch"
          aria-checked={ligado}
          aria-label={etiqueta}
        >
          {aGravar ? (
            <span className="absolute inset-0 flex items-center justify-center">
              <Spinner size="sm" />
            </span>
          ) : (
            <span
              className="absolute top-0.5 left-0.5 w-5 h-5 rounded-full transition-transform"
              style={{
                background: 'var(--on-accent)',
                transform: ligado ? 'translateX(20px)' : 'translateX(0)',
              }}
            />
          )}
        </button>
      </div>
    </div>
  )
}

export default function PrivacyPage() {
  const router = useRouter()
  const { isReady, user } = useRequireAuth()
  const { setAuth, accessToken } = useAuthStore()

  const [aGravar, setAGravar] = useState<null | 'conta' | 'viagens'>(null)
  const [error, setError] = useState('')

  async function gravar(qual: 'conta' | 'viagens', corpo: Record<string, boolean>) {
    if (!user) return
    setAGravar(qual)
    setError('')
    try {
      const { user: updated } = await api.patch<{ user: AuthUser }>('/users/me', corpo)
      setAuth(updated, accessToken!)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao actualizar privacidade.')
    } finally {
      setAGravar(null)
    }
  }

  if (!isReady) {
    return (
      <div className="flex justify-center py-12">
        <Spinner size="lg" />
      </div>
    )
  }

  if (!user) return null

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

      <h1 className="text-xl font-bold mb-6" style={{ color: 'var(--text-primary)' }}>
        Privacidade
      </h1>

      {error && (
        <div className="mb-4">
          <AlertBanner variant="danger" message={error} />
        </div>
      )}

      <div className="flex flex-col gap-3">
        <Interruptor
          ligado={user.isPrivate}
          aoAlternar={() => gravar('conta', { isPrivate: !user.isPrivate })}
          aGravar={aGravar === 'conta'}
          Icone={user.isPrivate ? Lock : Globe}
          titulo={user.isPrivate ? 'Conta privada' : 'Conta pública'}
          etiqueta="Conta privada"
          descricao={
            user.isPrivate
              ? 'Só quem te segue vê os teus posts, roteiros e histórico de viagens.'
              : 'Qualquer pessoa vê os teus posts, roteiros e histórico de viagens.'
          }
        />

        <Interruptor
          ligado={user.shareUpcomingTrips}
          aoAlternar={() => gravar('viagens', { shareUpcomingTrips: !user.shareUpcomingTrips })}
          aGravar={aGravar === 'viagens'}
          Icone={user.shareUpcomingTrips ? CalendarClock : CalendarOff}
          titulo="Mostrar datas de viagens por acontecer"
          etiqueta="Mostrar datas de viagens futuras"
          descricao={
            user.shareUpcomingTrips
              ? 'As datas das tuas viagens futuras e a decorrer são visíveis para toda a gente.'
              : 'As datas de viagens futuras e a decorrer só aparecem a quem te segue. As de viagens passadas continuam visíveis.'
          }
        />
      </div>

      <div
        className="mt-4 rounded-xl p-4 text-xs"
        style={{
          background: 'color-mix(in srgb, var(--accent) 6%, transparent)',
          border: '1px solid color-mix(in srgb, var(--accent) 15%, transparent)',
          color: 'var(--text-secondary)',
        }}
      >
        <p className="font-semibold mb-1" style={{ color: 'var(--accent)' }}>
          Porque é que as datas são tratadas à parte
        </p>
        <p className="mb-2">
          Uma viagem que já aconteceu é uma história, e é o que dá vida ao Explorar. Uma viagem
          que ainda não terminou é outra coisa: diz que não estás em casa, e diz-o a quem quiser
          ler. Por isso as datas ficam reservadas por omissão, sem tirares a conta do Explorar.
        </p>
        <p style={{ color: 'var(--text-muted)' }}>
          Liga isto se quiseres anunciar uma viagem antes de ires — para combinar com gente pelo
          caminho, por exemplo.
        </p>
      </div>

      <div
        className="mt-3 rounded-xl p-4 text-xs"
        style={{ border: '1px solid var(--border)', color: 'var(--text-secondary)' }}
      >
        <p className="font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>
          O que muda ao tornar a conta privada?
        </p>
        <ul className="list-disc list-inside space-y-1">
          <li>Os teus posts deixam de aparecer no Explorar e na pesquisa</li>
          <li>O teu perfil, os check-ins e o mapa de países ficam só para seguidores</li>
          <li>Os teus roteiros ficam visíveis apenas para ti e para quem te segue</li>
        </ul>
        <p className="mt-2" style={{ color: 'var(--text-muted)' }}>
          Nota: seguir-te é imediato e não precisa de aprovação, por isso quem carregar em
          Seguir passa a ver o conteúdo.
        </p>
      </div>
    </div>
  )
}

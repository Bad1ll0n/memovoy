'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Heart, CheckCircle2 } from 'lucide-react'
import { api } from '@/lib/api'
import { useAuthStore } from '@/store/authStore'

interface ReactionData {
  queroIr: number
  jaFui:   number
  viewerReaction: 'quero_ir' | 'ja_fui' | null
}

export function ItineraryReactions({ itineraryId }: { itineraryId: string }) {
  const { user } = useAuthStore()
  const qc = useQueryClient()
  const qKey = ['itinerary-reactions', itineraryId]

  const { data } = useQuery<ReactionData>({
    queryKey: qKey,
    queryFn: () => api.get(`/itineraries/${itineraryId}/reactions`),
    staleTime: 30_000,
  })

  const reactMutation = useMutation({
    mutationFn: async (type: 'quero_ir' | 'ja_fui' | null) => {
      if (type === null) {
        return api.delete(`/itineraries/${itineraryId}/reactions`)
      }
      return api.post(`/itineraries/${itineraryId}/reactions`, { type })
    },
    onMutate: async (type) => {
      await qc.cancelQueries({ queryKey: qKey })
      const prev = qc.getQueryData<ReactionData>(qKey)
      qc.setQueryData<ReactionData>(qKey, (old) => {
        if (!old) return old
        const was = old.viewerReaction
        const next: ReactionData = {
          queroIr: old.queroIr,
          jaFui:   old.jaFui,
          viewerReaction: type,
        }
        if (was === 'quero_ir') next.queroIr = Math.max(0, next.queroIr - 1)
        if (was === 'ja_fui')   next.jaFui   = Math.max(0, next.jaFui - 1)
        if (type === 'quero_ir') next.queroIr += 1
        if (type === 'ja_fui')   next.jaFui   += 1
        return next
      })
      return { prev }
    },
    onError: (_err, _type, ctx) => {
      if (ctx?.prev) qc.setQueryData(qKey, ctx.prev)
    },
    onSettled: () => qc.invalidateQueries({ queryKey: qKey }),
  })

  const r = data ?? { queroIr: 0, jaFui: 0, viewerReaction: null }

  function handleReaction(type: 'quero_ir' | 'ja_fui') {
    if (!user) return
    reactMutation.mutate(r.viewerReaction === type ? null : type)
  }

  return (
    <div className="flex gap-2 mt-3">
      <button
        onClick={() => handleReaction('quero_ir')}
        disabled={!user || reactMutation.isPending}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm transition-opacity hover:opacity-80 disabled:opacity-40"
        style={{
          background:  r.viewerReaction === 'quero_ir' ? 'rgba(248,113,113,0.15)' : 'var(--surface2)',
          color:       r.viewerReaction === 'quero_ir' ? 'var(--danger)' : 'var(--text-secondary)',
          border:      `1px solid ${r.viewerReaction === 'quero_ir' ? 'rgba(248,113,113,0.35)' : 'var(--border)'}`,
        }}
        title={user ? 'Quero ir a este destino' : 'Inicia sessão para reagir'}
      >
        <Heart className="w-3.5 h-3.5" fill={r.viewerReaction === 'quero_ir' ? 'currentColor' : 'none'} />
        Quero ir
        {r.queroIr > 0 && <span className="font-semibold">{r.queroIr}</span>}
      </button>

      <button
        onClick={() => handleReaction('ja_fui')}
        disabled={!user || reactMutation.isPending}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm transition-opacity hover:opacity-80 disabled:opacity-40"
        style={{
          background:  r.viewerReaction === 'ja_fui' ? 'rgba(52,211,153,0.12)' : 'var(--surface2)',
          color:       r.viewerReaction === 'ja_fui' ? 'var(--success)' : 'var(--text-secondary)',
          border:      `1px solid ${r.viewerReaction === 'ja_fui' ? 'rgba(52,211,153,0.35)' : 'var(--border)'}`,
        }}
        title={user ? 'Já estive neste destino' : 'Inicia sessão para reagir'}
      >
        <CheckCircle2 className="w-3.5 h-3.5" fill={r.viewerReaction === 'ja_fui' ? 'currentColor' : 'none'} />
        Já fui
        {r.jaFui > 0 && <span className="font-semibold">{r.jaFui}</span>}
      </button>
    </div>
  )
}

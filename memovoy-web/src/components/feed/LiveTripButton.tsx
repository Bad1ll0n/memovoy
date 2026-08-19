'use client'

import { useState } from 'react'
import { Radio } from 'lucide-react'
import { CreatePostModal } from './CreatePostModal'

async function reverseGeocode(lat: number, lng: number): Promise<string> {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=10`,
      { headers: { 'User-Agent': 'Memovoy-app/1.0', 'Accept-Language': 'pt' } },
    )
    if (!res.ok) return ''
    const data = await res.json()
    return (
      data.address?.city ??
      data.address?.town ??
      data.address?.village ??
      data.address?.county ??
      data.display_name?.split(',')[0] ??
      ''
    )
  } catch {
    return ''
  }
}

interface Props {
  className?: string
}

export function LiveTripButton({ className }: Props) {
  const [open, setOpen]           = useState(false)
  const [loading, setLoading]     = useState(false)
  const [destination, setDest]    = useState<string | undefined>(undefined)
  const [error, setError]         = useState('')

  async function handleLive() {
    if (!navigator.geolocation) {
      setError('O teu browser não suporta geolocalização.')
      return
    }
    setLoading(true)
    setError('')
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const place = await reverseGeocode(pos.coords.latitude, pos.coords.longitude)
        setDest(place || undefined)
        setLoading(false)
        setOpen(true)
      },
      () => {
        setLoading(false)
        setOpen(true) // open anyway without location
      },
      { timeout: 8000, maximumAge: 60000 },
    )
  }

  return (
    <>
      <button
        onClick={handleLive}
        disabled={loading}
        className={`flex items-center gap-1.5 text-sm font-semibold px-3 py-1.5 rounded-xl transition-all hover:opacity-80 ${className ?? ''}`}
        // Tokens, não cores em código. Estavam aqui os valores do tema claro
        // aplicados aos dois, e no escuro davam 3,75:1 — abaixo do mínimo.
        // Não há um vermelho que sirva os dois temas: o claro precisa de um
        // mais escuro, o escuro de um mais claro. É para isso que o token existe.
        style={{ background: 'var(--danger-subtle)', color: 'var(--danger)' }}
        title="Partilhar localização em tempo real"
      >
        <Radio className={`w-3.5 h-3.5 ${loading ? 'animate-pulse' : ''}`} />
        {loading ? 'A localizar…' : 'LIVE'}
      </button>

      {error && (
        <p className="text-xs mt-1" style={{ color: 'var(--danger)' }}>
          {error}
        </p>
      )}

      {open && (
        <CreatePostModal
          initialDestination={destination}
          onClose={() => { setOpen(false); setDest(undefined) }}
        />
      )}
    </>
  )
}

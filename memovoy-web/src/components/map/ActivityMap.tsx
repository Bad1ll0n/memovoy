'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

export interface ActivityPin {
  name: string
  address: string | null
  geoName?: string | null
  type: string
}

interface GeoMarker {
  lat: number
  lng: number
  label: string
  index: number
  type: string
}

/**
 * Cores para desenhar SOBRE o mapa.
 *
 * O mapa é sempre claro, independentemente do tema da interface. Foi decisão
 * deliberada: a cartografia é linha fina e nome pequeno, e o contraste que
 * serve uma interface escura não serve aqui.
 *
 * A consequência é que o que se desenha em cima dele não pode seguir o tema.
 * Estas cores eram lidas de var(--accent), e no tema escuro isso dá o azul
 * claro (#47A3CB) — que sobre um mapa pálido quase desaparece. Ficam fixas, e
 * escolhidas para fundo claro.
 *
 * Isto substitui o corDoTema() que aqui esteve: fazia sentido enquanto o mapa
 * acompanhava o tema, e deixou de fazer no momento em que o mapa deixou de o
 * acompanhar.
 */
const SOBRE_O_MAPA = {
  acento:      '#1A6B9F',   // o acento do tema claro
  acentoForte: '#155A89',   // contorno, um tom abaixo
}

const TYPE_COLORS: Record<string, string> = {
  visit:     '#60a5fa',
  food:      '#4ade80',
  transport: '#c084fc',
  leisure:   '#fca311',
  hotel:     '#f472b6',
}

async function geocodeAddress(address: string): Promise<[number, number] | null> {
  try {
    const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(address)}&limit=1`
    const res = await fetch(url, {
      headers: {
        'Accept-Language': 'pt',
        'User-Agent': 'Memovoy-app/1.0',
      },
    })
    if (!res.ok) return null
    const data = await res.json()
    if (data?.[0]) return [parseFloat(data[0].lat), parseFloat(data[0].lon)]
    return null
  } catch {
    return null
  }
}

function haversineKm(a: GeoMarker, b: GeoMarker): number {
  const R = 6371
  const dLat = ((b.lat - a.lat) * Math.PI) / 180
  const dLng = ((b.lng - a.lng) * Math.PI) / 180
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h))
}

function clusterMarkers(markers: GeoMarker[], thresholdKm = 0.12): GeoMarker[][] {
  const clusters: GeoMarker[][] = []
  const assigned = new Set<number>()
  for (let i = 0; i < markers.length; i++) {
    if (assigned.has(i)) continue
    const cluster = [markers[i]]
    assigned.add(i)
    for (let j = i + 1; j < markers.length; j++) {
      if (assigned.has(j)) continue
      if (haversineKm(markers[i], markers[j]) < thresholdKm) {
        cluster.push(markers[j])
        assigned.add(j)
      }
    }
    clusters.push(cluster)
  }
  return clusters
}

interface Props {
  activities: ActivityPin[]
}

export function ActivityMap({ activities }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef       = useRef<L.Map | null>(null)
  const [markers, setMarkers]   = useState<GeoMarker[]>([])
  const [statusGeocode, setStatusGeocode] = useState<'loading' | 'ready' | 'empty'>('loading')

  // Não haver nada para geocodificar é derivável das props — não precisa de um
  // efeito a corrigir o estado depois de pintar.
  const toGeocode = useMemo(
    () => activities
      .map((a, i) => ({ ...a, index: i }))
      .filter((a) => a.type !== 'transport' && ((a.geoName && a.geoName.trim().length > 0) || (a.address && a.address.trim().length > 0)))
      .slice(0, 12), // cap at 12 to avoid long waits
    [activities],
  )

  const status = toGeocode.length === 0 ? 'empty' : statusGeocode

  // Geocode all activities with addresses (rate-limited: 1 req/s)
  useEffect(() => {
    if (toGeocode.length === 0) return

    let cancelled = false
    const results: GeoMarker[] = []

    ;(async () => {
      for (const [seq, act] of toGeocode.entries()) {
        if (cancelled) return
        if (seq > 0) await new Promise((r) => setTimeout(r, 1100)) // Nominatim: max 1 req/s
        const query = act.geoName?.trim() || act.address!
        const coords = await geocodeAddress(query)
        if (coords) {
          results.push({ lat: coords[0], lng: coords[1], label: act.name, index: act.index, type: act.type })
        }
      }
      if (!cancelled) {
        setMarkers(results)
        setStatusGeocode(results.length > 0 ? 'ready' : 'empty')
      }
    })()

    return () => { cancelled = true }
  }, [toGeocode])

  // Init/update Leaflet map when markers are ready
  useEffect(() => {
    if (status !== 'ready' || !containerRef.current || markers.length === 0) return

    // Destroy previous instance
    mapRef.current?.remove()
    mapRef.current = null

    const map = L.map(containerRef.current, { zoomControl: true, attributionControl: true })
    mapRef.current = map

    // Tiles claros, sempre — não acompanham o tema.
    //
    // Estavam escuros mesmo no modo claro, e o utilizador queixou-se de não se
    // ver bem. Um mapa é uma imagem densa de linhas finas e nomes pequenos: o
    // contraste do escuro que serve a interface não serve a cartografia.
    L.tileLayer('https://tiles.stadiamaps.com/tiles/alidade_smooth/{z}/{x}/{y}{r}.png', {
      attribution: '© <a href="https://stadiamaps.com/">Stadia Maps</a> © <a href="https://openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 20,
    }).addTo(map)

    const bounds: L.LatLngExpression[] = []
    const clusters = clusterMarkers(markers)

    clusters.forEach((cluster) => {
      const centLat = cluster.reduce((s, m) => s + m.lat, 0) / cluster.length
      const centLng = cluster.reduce((s, m) => s + m.lng, 0) / cluster.length

      if (cluster.length === 1) {
        const m     = cluster[0]
        const color = TYPE_COLORS[m.type] ?? '#94a3b8'
        const icon  = L.divIcon({
          className: '',
          html: `<div style="width:26px;height:26px;border-radius:50%;background:${color};border:2px solid #fff;display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:700;color:#000;box-shadow:0 2px 6px rgba(0,0,0,0.45);line-height:1">${m.index + 1}</div>`,
          iconSize: [26, 26], iconAnchor: [13, 13], popupAnchor: [0, -16],
        })
        L.marker([m.lat, m.lng], { icon })
          .addTo(map)
          .bindPopup(`<b>${m.label}</b>`)
      } else {
        const labels = cluster.map((m) => `${m.index + 1}. ${m.label}`).join('<br>')
        const icon   = L.divIcon({
          className: '',
          html: `<div style="width:34px;height:34px;border-radius:50%;background:#fff;border:2.5px solid ${SOBRE_O_MAPA.acento};display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:800;color:#000;box-shadow:0 2px 8px rgba(0,0,0,0.4);line-height:1">${cluster.length}</div>`,
          iconSize: [34, 34], iconAnchor: [17, 17], popupAnchor: [0, -20],
        })
        const clusterMarker = L.marker([centLat, centLng], { icon }).addTo(map)
        clusterMarker.bindPopup(`<b>${cluster.length} locais</b><br>${labels}`)
        clusterMarker.on('click', () => {
          const cb = L.latLngBounds(cluster.map((m): L.LatLngExpression => [m.lat, m.lng]))
          map.fitBounds(cb, { padding: [40, 40], maxZoom: 16 })
        })
      }

      bounds.push([centLat, centLng])
    })

    if (bounds.length > 0) {
      if (bounds.length === 1) {
        map.setView(bounds[0] as L.LatLngExpression, 14)
      } else {
        map.fitBounds(L.latLngBounds(bounds as L.LatLngExpression[]), { padding: [32, 32], maxZoom: 15 })
      }
    }

    return () => {
      map.remove()
      mapRef.current = null
    }
  }, [markers, status])

  if (status === 'empty') return null

  if (status === 'loading') {
    return (
      <div
        className="flex items-center justify-center rounded-xl mb-5"
        style={{ height: 240, background: 'var(--bg-card)', border: '1px solid var(--border)' }}
      >
        <div className="text-center">
          <div className="spinner spinner-lg mx-auto mb-2" />
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
            A geocodificar locais…
          </p>
        </div>
      </div>
    )
  }

  return (
    <div
      ref={containerRef}
      className="rounded-xl overflow-hidden mb-5"
      style={{ height: 240, border: '1px solid var(--border)' }}
    />
  )
}

'use client'

import { useEffect, useMemo, useRef } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { activityTypeColor, COR_DESCONHECIDA } from '@/components/itinerary/actividade'

export interface ActivityPin {
  name: string
  address: string | null
  geoName?: string | null
  type: string
  /** Resolvidas no servidor ao gerar o roteiro. Ver services/geocodificar.js. */
  lat?: number | null
  lon?: number | null
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

// As cores vinham daqui, numa tabela própria — e nela o `food` era VERDE e o
// `leisure` LARANJA, ao contrário das etiquetas da lista. Um restaurante tinha
// etiqueta laranja e pino verde no mesmo ecrã.
//
// Passam a vir de components/itinerary/actividade.ts, que é a mesma fonte que
// as etiquetas usam.

// A geocodificação vivia aqui, no browser. Foi para o servidor —
// services/geocodificar.js — onde acontece uma vez por lugar em vez de uma vez
// por visita, com cache partilhada e com o cabeçalho de identificação que a
// política do Nominatim exige e que os browsers não deixam enviar.

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

  // As coordenadas já vêm resolvidas do servidor.
  //
  // Antes eram pedidas ao Nominatim aqui, uma por actividade, a cada visita. A
  // política do serviço é um pedido por segundo, portanto o utilizador esperava
  // uns catorze segundos pelo mapa — e um roteiro visto quinhentas vezes fazia
  // quase vinte mil pedidos pelos MESMOS lugares.
  //
  // Agora a resolução acontece uma vez, no servidor, ao gerar, com cache global
  // partilhada por todos os utilizadores. Aqui só se desenha.
  const markers: GeoMarker[] = useMemo(
    () => activities
      .map((a, i) => ({ ...a, index: i }))
      .filter((a) => typeof a.lat === 'number' && typeof a.lon === 'number')
      .map((a) => ({ lat: a.lat as number, lng: a.lon as number, label: a.name, index: a.index, type: a.type })),
    [activities],
  )

  // Quantas ficaram por resolver. A interface diz-lo em vez de as deixar
  // desaparecer: hoje o utilizador não distinguia "não há mapa" de "faltam
  // três actividades no mapa", e a segunda é uma informação que ele merece.
  const semLocalizacao = useMemo(
    () => activities.filter(
      (a) => a.type !== 'transport' && typeof a.lat !== 'number',
    ).length,
    [activities],
  )

  const status: 'ready' | 'empty' = markers.length > 0 ? 'ready' : 'empty'

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
        const color = activityTypeColor[m.type] ?? COR_DESCONHECIDA
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

  // Já não há estado de carregamento: as coordenadas vêm com o roteiro.
  //
  // O ecrã "A geocodificar locais…" desapareceu com a espera que o justificava.
  // Quando ainda não há nenhuma resolvida — roteiro acabado de gerar, com a
  // geocodificação a correr em segundo plano — não se mostra mapa nenhum, e
  // aparece na visita seguinte.
  if (status === 'empty') return null

  return (
    <div className="mb-5">
      <div
        ref={containerRef}
        className="rounded-xl overflow-hidden"
        style={{ height: 240, border: '1px solid var(--border)' }}
      />
      {semLocalizacao > 0 && (
        // Dizer o que falta em vez de deixar desaparecer.
        //
        // Antes, uma actividade que não se conseguia localizar simplesmente não
        // aparecia, e o utilizador não tinha como distinguir "este mapa está
        // completo" de "faltam aqui três". Um mapa incompleto que se assume é
        // honesto; um que se cala parece completo e não é.
        <p className="text-xs mt-2" style={{ color: 'var(--text-muted)' }}>
          {semLocalizacao === 1
            ? '1 actividade sem localização no mapa'
            : `${semLocalizacao} actividades sem localização no mapa`}
        </p>
      )}
    </div>
  )
}

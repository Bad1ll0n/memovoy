'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import { GitFork, MapPin } from 'lucide-react'
import { api } from '@/lib/api'

interface LineageNode {
  id:          string
  title:       string
  destination: string
  coverUrl:    string | null
  author:      { username: string; avatarUrl: string | null }
}

interface LineageData {
  parent:   LineageNode | null
  children: LineageNode[]
}

function NodeCard({ node, label }: { node: LineageNode; label: string }) {
  return (
    <Link
      href={`/itineraries/${node.id}`}
      className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:opacity-80 transition-opacity"
      style={{ background: 'var(--surface2)', border: '1px solid var(--border)' }}
    >
      {node.coverUrl ? (
        <div className="relative w-10 h-10 shrink-0 rounded-lg overflow-hidden">
          <Image src={node.coverUrl} alt={node.title} fill className="object-cover" sizes="40px" unoptimized />
        </div>
      ) : (
        <div
          className="w-10 h-10 shrink-0 rounded-lg flex items-center justify-center"
          style={{ background: 'rgba(34,152,206,0.1)' }}
        >
          <MapPin className="w-4 h-4" style={{ color: 'var(--accent)' }} />
        </div>
      )}
      <div className="flex-1 min-w-0">
        <p className="text-[10px] font-semibold uppercase tracking-wide mb-0.5" style={{ color: 'var(--text-muted)' }}>
          {label}
        </p>
        <p className="text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>
          {node.title}
        </p>
        <p className="text-xs truncate" style={{ color: 'var(--text-muted)' }}>
          @{node.author.username} · {node.destination}
        </p>
      </div>
    </Link>
  )
}

export function ItineraryLineage({ itineraryId }: { itineraryId: string }) {
  const { data } = useQuery<LineageData>({
    queryKey: ['itinerary-lineage', itineraryId],
    queryFn: () => api.get(`/itineraries/${itineraryId}/lineage`),
    staleTime: 60_000,
  })

  const hasParent   = !!data?.parent
  const hasChildren = (data?.children?.length ?? 0) > 0

  if (!hasParent && !hasChildren) return null

  return (
    <div className="card p-4 mb-4">
      <div className="flex items-center gap-2 mb-3">
        <GitFork className="w-4 h-4" style={{ color: 'var(--accent)' }} />
        <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
          Árvore de roteiros
        </p>
      </div>

      <div className="space-y-2">
        {hasParent && (
          <NodeCard node={data!.parent!} label="Baseado em" />
        )}
        {data?.children.map((child) => (
          <NodeCard key={child.id} node={child} label="Cópia criada por" />
        ))}
      </div>
    </div>
  )
}

// src/lib/utils.ts
import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'
import { formatDistanceToNow, parseISO } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import type { ActivityCategory } from '@/types'

// Merge de classes Tailwind sem conflitos
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// Data relativa em português
export function formatRelative(dateStr: string): string {
  try {
    return formatDistanceToNow(parseISO(dateStr), {
      addSuffix: true,
      locale:    ptBR,
    })
  } catch {
    return dateStr
  }
}

// Data curta: "12 Jun 2026"
export function formatDate(dateStr: string): string {
  try {
    return new Intl.DateTimeFormat('pt-PT', {
      day: 'numeric', month: 'short', year: 'numeric',
    }).format(parseISO(dateStr))
  } catch {
    return dateStr
  }
}

// Intervalo de datas: "12 Jun – 18 Jun 2026"
export function formatDateRange(start: string, end: string): string {
  try {
    const s = parseISO(start)
    const e = parseISO(end)
    const sameYear = s.getFullYear() === e.getFullYear()
    const sameMonth = s.getMonth() === e.getMonth()
    const fmt = new Intl.DateTimeFormat('pt-PT', { day: 'numeric', month: 'short' })
    const fmtYear = new Intl.DateTimeFormat('pt-PT', { day: 'numeric', month: 'short', year: 'numeric' })
    return `${fmt.format(s)} – ${fmtYear.format(e)}`
  } catch {
    return `${start} – ${end}`
  }
}

// Ícone por categoria de actividade
export function categoryIcon(cat: ActivityCategory | null | undefined): string {
  const map: Record<ActivityCategory, string> = {
    attraction: '🏛',
    restaurant: '🍽',
    transport:  '🚆',
    hotel:      '🏨',
    activity:   '🎯',
    break:      '☕',
  }
  return cat ? (map[cat] ?? '📍') : '📍'
}

// Ícone de país (flag emoji a partir de código ISO)
export function countryFlag(code: string): string {
  return code
    .toUpperCase()
    .replace(/./g, (c) =>
      String.fromCodePoint(127397 + c.charCodeAt(0))
    )
}

// Formatar montante em EUR cents
export function formatMoney(cents: number, currency = 'EUR'): string {
  return new Intl.NumberFormat('pt-PT', {
    style:    'currency',
    currency,
    maximumFractionDigits: cents % 100 === 0 ? 0 : 2,
  }).format(cents / 100)
}

// Label do tipo de grupo
export function groupTypeLabel(type: string): string {
  const labels: Record<string, string> = {
    solo:    'Solo',
    couple:  'Casal',
    friends: 'Amigos',
    family:  'Família',
  }
  return labels[type] ?? type
}

// Label do nível — cores via CSS vars para que alterações à paleta propaguem automaticamente
export function levelLabel(level: string): { label: string; color: string } {
  const map: Record<string, { label: string; color: string }> = {
    explorer:     { label: 'Explorador',   color: 'var(--brand-blue)'   },
    traveler:     { label: 'Viajante',     color: 'var(--brand-green)'  },
    nomad:        { label: 'Nómada',       color: 'var(--brand-purple)' },
    globetrotter: { label: 'Globetrotter', color: 'var(--brand-amber)'  },
  }
  return map[level] ?? { label: level, color: 'var(--brand-blue)' }
}

// Truncar texto com reticências
export function truncate(str: string, maxLen: number): string {
  if (str.length <= maxLen) return str
  return str.slice(0, maxLen - 1) + '…'
}

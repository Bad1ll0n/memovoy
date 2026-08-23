/**
 * O que é uma actividade de um roteiro.
 *
 * Isto vivia dentro do ItineraryClient, que é a página de um roteiro já
 * guardado. Quando o ecrã de revisão — antes de guardar — passou a precisar
 * das mesmas peças, copiar era garantir que os dois se afastariam: uma
 * mudança no modelo de dados corrigida num sítio e esquecida no outro.
 */

export interface Activity {
  time: string
  name: string
  description: string
  address: string | null
  geoName?: string | null
  cost: number | null
  currency: string
  type: 'visit' | 'food' | 'transport' | 'leisure' | 'hotel'
  tips: string | null
  /** Resolvidas no servidor ao gerar o roteiro, não vindas do modelo.
   *  Opcionais porque os roteiros criados antes disto não as têm. */
  lat?: number | null
  lon?: number | null
}

export interface Day {
  day: number
  date: string
  theme: string
  activities: Activity[]
}

export interface EditTarget {
  dayIndex: number
  activityIndex: number
  activity: Activity
}

export const activityTypeLabel: Record<string, string> = {
  visit:     'Visita',
  food:      'Refeição',
  transport: 'Transporte',
  leisure:   'Lazer',
  hotel:     'Alojamento',
}

export const activityTypeClass: Record<string, string> = {
  visit:     'act-visit',
  food:      'act-food',
  transport: 'act-transport',
  leisure:   'act-leisure',
  hotel:     'act-hotel',
}

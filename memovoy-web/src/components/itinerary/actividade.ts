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
  /** Quantos minutos demora. Null nos roteiros gerados antes de o passarmos a pedir. */
  durationMin?: number | null
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
  /** Preenchido pelo servidor quando o sítio está fechado à hora marcada. */
  avisoDeHorario?: string | null
  /** A etiqueta opening_hours do OpenStreetMap, em bruto. */
  horarioConhecido?: string | null
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

/**
 * "1h30" a partir de 90.
 *
 * Mostrar a duração não é decoração: era a informação que faltava para se ver
 * que um dia estava a meio. Uma lista de horas de início não diz que entre uma
 * igreja de meia hora e o almoço três horas depois há duas horas e meia sem
 * nada — e foi assim que um roteiro de sete dias em Roma saiu com metade do dia
 * vazia sem ninguém reparar.
 */
export function duracaoLegivel(minutos: number | null | undefined): string | null {
  if (typeof minutos !== 'number' || !Number.isFinite(minutos) || minutos <= 0) return null
  const h = Math.floor(minutos / 60)
  const m = Math.round(minutos % 60)
  if (h === 0) return `${m}min`
  return m === 0 ? `${h}h` : `${h}h${String(m).padStart(2, '0')}`
}

export const activityTypeClass: Record<string, string> = {
  visit:     'act-visit',
  food:      'act-food',
  transport: 'act-transport',
  leisure:   'act-leisure',
  hotel:     'act-hotel',
}

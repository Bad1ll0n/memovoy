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

/**
 * Distância em linha recta entre duas actividades, em metros.
 *
 * Um mapa com pinos mostra que os sítios existem; não mostra se dois estão a
 * duzentos metros ou a três quilómetros um do outro. É essa a pergunta de quem
 * revê um roteiro a pé — e sem resposta, um dia que atravessa a cidade duas
 * vezes parece igual a um dia que se faz num bairro.
 */
export function distanciaEntre(a: Activity, b: Activity): number | null {
  if (typeof a.lat !== 'number' || typeof a.lon !== 'number') return null
  if (typeof b.lat !== 'number' || typeof b.lon !== 'number') return null

  const R = 6371000
  const rad = (g: number) => (g * Math.PI) / 180
  const dLat = rad(b.lat - a.lat)
  const dLon = rad(b.lon - a.lon)
  const h = Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2
  return Math.round(R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h)))
}

/**
 * "450 m" ou "2,3 km", e quanto tempo dá isso a pé.
 *
 * A pé conta-se a 4,5 km/h — o ritmo de quem passeia numa cidade, não o de
 * quem vai para o trabalho. E a distância é em linha recta, portanto o tempo
 * real é sempre maior: as ruas não são rectas e há semáforos. Fica dito no
 * ecrã com um "≈" em vez de se fingir precisão que não existe.
 */
export function distanciaLegivel(metros: number | null): string | null {
  if (metros === null || metros < 50) return null   // dois passos não é distância
  const texto = metros < 1000
    ? `${metros} m`
    : `${(metros / 1000).toFixed(1).replace('.', ',')} km`
  const minutos = Math.round((metros / 4500) * 60)
  return minutos >= 3 ? `${texto} · ≈${minutos} min a pé` : texto
}

/**
 * A cor de cada tipo de actividade. Uma tabela só, para o mapa e as etiquetas.
 *
 * Havia duas, e não concordavam. O mapa tinha a sua própria lista, e nela o
 * `food` era VERDE e o `leisure` LARANJA — exactamente ao contrário das
 * etiquetas. Um restaurante aparecia com a etiqueta laranja na lista e um pino
 * verde no mapa, a poucos centímetros de distância no mesmo ecrã.
 *
 * Duas tabelas do mesmo mapeamento afastam-se sempre; esta afastou-se de forma
 * a trocar dois valores um pelo outro, que é o pior caso: nada parece partido,
 * só se lê ao contrário.
 *
 * Os valores são os mesmos de globals.css (.act-*). Se um mudar, muda lá também
 * — e o teste em actividade.test.ts existe para que a troca não volte.
 */
export const activityTypeColor: Record<string, string> = {
  visit:     '#60a5fa',   // azul
  food:      '#fb923c',   // laranja
  transport: '#a1a1aa',   // cinza
  leisure:   '#4ade80',   // verde
  hotel:     '#c084fc',   // roxo
}

/** Para um tipo que não conhecemos — cinza neutro, sem fingir que sabe. */
export const COR_DESCONHECIDA = '#94a3b8'

export const activityTypeClass: Record<string, string> = {
  visit:     'act-visit',
  food:      'act-food',
  transport: 'act-transport',
  leisure:   'act-leisure',
  hotel:     'act-hotel',
}

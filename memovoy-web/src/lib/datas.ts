/**
 * Mostrar um dia do calendário.
 *
 * A API devolve as datas de viagem como 'YYYY-MM-DD' — um dia, sem hora e sem
 * fuso. `new Date('2027-05-10')` lê isso como meia-noite UTC, e daí em diante
 * tudo depende de em que fuso se formata:
 *
 *     formatado em UTC        10 de Maio    ✓
 *     formatado em Lisboa     10 de Maio    ✓  (01:00 do dia 10)
 *     formatado em São Paulo   9 de Maio    ✗  (21:00 do dia 9)
 *
 * Havia três cópias disto com `timeZone: 'UTC'` e uma sem, no PostCard. A que
 * não tinha mostrava o dia errado a quem estivesse atrás de UTC — e ninguém
 * repararia daqui, porque em Portugal dá certo.
 *
 * Uma cópia só, e o fuso fixado em UTC, que é o único que devolve o dia que a
 * base de dados guardou seja onde for que a página seja aberta.
 */

type Formato = 'curto' | 'longo'

const OPCOES: Record<Formato, Intl.DateTimeFormatOptions> = {
  curto: { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' },
  longo: { day: 'numeric', month: 'long',  year: 'numeric', timeZone: 'UTC' },
}

export function formatarData(iso: string | null | undefined, formato: Formato = 'curto'): string {
  if (!iso) return ''
  const d = new Date(iso)
  // Uma data inválida daria "Invalid Date" no meio da página. Preferível não
  // mostrar nada do que mostrar isso.
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleDateString('pt-PT', OPCOES[formato])
}

/** "10 mai 2027 → 12 mai 2027", ou só a primeira se não houver fim. */
export function formatarIntervalo(
  inicio: string | null | undefined,
  fim: string | null | undefined,
  formato: Formato = 'curto',
): string {
  const a = formatarData(inicio, formato)
  if (!a) return ''
  const b = formatarData(fim, formato)
  return b ? `${a} → ${b}` : a
}

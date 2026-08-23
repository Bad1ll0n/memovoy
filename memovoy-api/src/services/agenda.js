/**
 * Um dia mede-se em horas, não em número de actividades.
 *
 * A regra antiga pedia "4 a 6 actividades" e as refeições contavam. Com almoço
 * e jantar obrigatórios sobravam duas visitas por dia, e o modelo cumpria a
 * instrução à letra enquanto entregava um dia a meio.
 *
 * Medido num roteiro de sete dias em Roma, janela pedida das 09:00 às 22:00:
 *
 *     Dia 3   Santa Maria em Trastevere (30 min de visita)   →  3h até ao almoço
 *             Orto Botanico (1h)                             →  5h até ao jantar
 *
 * Seis horas por dia sem nada marcado, todos os dias, e a contagem cumprida.
 * Contar entradas não diz nada sobre o dia; somar durações diz.
 *
 * Este módulo não fala com o modelo. Recebe dias e devolve números — o que
 * permite testá-lo sem gastar uma chamada, e o que faz da verificação uma
 * conta em vez de uma opinião.
 */

/**
 * Que fatia da janela tem de estar ocupada para o dia contar como cheio.
 *
 * 70% e não 100%: um dia inteiramente preenchido não é um bom dia de viagem, é
 * uma maratona. Fica margem para o café que não estava no plano e para chegar
 * atrasado a alguma coisa. Abaixo disto já não é margem, é vazio — o roteiro de
 * Roma andava pelos 45%.
 */
export const COBERTURA_MINIMA = 0.70

/**
 * Quanto tempo se assume entre duas paragens quando não há transporte marcado.
 *
 * Numa cidade, com o agrupamento geográfico que o prompt exige, quinze minutos
 * a pé cobrem a maior parte dos saltos dentro do mesmo bairro. Não é exacto e
 * não precisa de ser: serve para a soma não fingir que se teletransporta.
 */
export const DESLOCACAO_MIN = 15

/** Minutos desde a meia-noite. */
export function emMinutos(hhmm) {
  if (typeof hhmm !== 'string') return null
  const m = hhmm.match(/^([01]\d|2[0-3]):([0-5]\d)$/)
  return m ? Number(m[1]) * 60 + Number(m[2]) : null
}

/** O contrário, para mensagens legíveis. */
export function paraHoras(minutos) {
  const h = Math.floor(minutos / 60)
  const m = Math.round(minutos % 60)
  return m === 0 ? `${h}h` : `${h}h${String(m).padStart(2, '0')}`
}

/**
 * Quanto tempo um dia realmente ocupa, e quanto sobra.
 *
 * Conta as durações declaradas e acrescenta uma deslocação entre paragens
 * consecutivas. Não conta a deslocação depois da última — depois do jantar já
 * não há para onde ir dentro do dia.
 *
 * @returns {{ocupado:number, janela:number, cobertura:number, vazio:number,
 *            buracos:Array<{depoisDe:string, minutos:number}>, problemas:string[]}}
 */
export function medirDia(dia, dayStart, dayEnd) {
  const inicio = emMinutos(dayStart)
  const fim    = emMinutos(dayEnd)
  const janela = (inicio !== null && fim !== null && fim > inicio) ? fim - inicio : 0

  const acts = (dia?.activities ?? [])
    .filter((a) => emMinutos(a.time) !== null)
    .slice()
    .sort((a, b) => emMinutos(a.time) - emMinutos(b.time))

  const problemas = []
  const buracos   = []
  let ocupado = 0

  for (let i = 0; i < acts.length; i++) {
    const a = acts[i]
    const comeca = emMinutos(a.time)
    // Uma duração em falta conta como zero e é assinalada. Inventar um valor
    // aqui escondia exactamente o que se quer ver.
    const dura = Number.isInteger(a.durationMin) && a.durationMin > 0 ? a.durationMin : 0
    if (dura === 0) problemas.push(`"${a.name}" não diz quanto tempo demora`)

    ocupado += dura

    if (comeca < inicio) problemas.push(`"${a.name}" começa às ${a.time}, antes de ${dayStart}`)
    if (comeca + dura > fim) {
      problemas.push(`"${a.name}" só acaba às ${paraHoras(comeca + dura)}, depois de ${dayEnd}`)
    }

    const prox = acts[i + 1]
    if (!prox) continue

    const folga = emMinutos(prox.time) - (comeca + dura)
    if (folga < 0) {
      problemas.push(`"${a.name}" ainda decorre quando "${prox.name}" começa`)
    } else {
      // A deslocação só conta até ao limite da folga: se o intervalo for de
      // cinco minutos, não se gastam quinze a andar.
      ocupado += Math.min(DESLOCACAO_MIN, folga)
      const vazio = folga - DESLOCACAO_MIN
      if (vazio >= 60) buracos.push({ depoisDe: a.name, minutos: vazio })
    }
  }

  // Um dia que ocupa mais do que a janela não é um dia muito cheio — é um dia
  // que não cabe. O Math.min esconde-o na cobertura, portanto assinala-se aqui.
  if (janela > 0 && ocupado > janela) {
    problemas.push(`o dia ocupa ${paraHoras(ocupado)} numa janela de ${paraHoras(janela)}`)
  }

  const cobertura = janela > 0 ? Math.min(1, ocupado / janela) : 0
  return { ocupado, janela, cobertura, vazio: Math.max(0, janela - ocupado), buracos, problemas }
}

/**
 * Os dias que não chegam para a janela que o utilizador pediu.
 *
 * Devolve o suficiente para se poder pedir ao modelo que os complete: qual é o
 * dia, quanto falta, e depois de que actividades é que ficaram os buracos.
 */
export function diasPorPreencher(dias, dayStart, dayEnd, minima = COBERTURA_MINIMA) {
  const fracos = []
  for (let i = 0; i < (dias?.length ?? 0); i++) {
    const m = medirDia(dias[i], dayStart, dayEnd)
    if (m.janela === 0) continue
    if (m.cobertura < minima) {
      fracos.push({ indice: i, dia: dias[i]?.day ?? i + 1, ...m })
    }
  }
  return fracos
}

/**
 * As refeições pedidas que faltam em cada dia.
 *
 * Não é tempo, mas descobriu-se ao medir tempo: quando o prompt passou a exigir
 * o dia cheio, o modelo começou a deitar fora o almoço para arranjar espaço.
 * Um dia a 95% sem almoço não é um dia bom — é um número bom.
 *
 * A hora é o que separa um almoço de um jantar; o modelo marca ambos como
 * `food`. As janelas são largas de propósito: há quem almoce às onze e quem
 * jante às dez.
 */
const JANELAS_DE_REFEICAO = {
  breakfast: [5 * 60, 11 * 60],
  lunch:     [11 * 60, 16 * 60],
  dinner:    [18 * 60, 23 * 60 + 59],
}

export function refeicoesEmFalta(dia, pedidas = []) {
  const comidas = (dia?.activities ?? []).filter((a) => a.type === 'food')
  return pedidas.filter((refeicao) => {
    const janela = JANELAS_DE_REFEICAO[refeicao]
    if (!janela) return false
    return !comidas.some((a) => {
      const m = emMinutos(a.time)
      return m !== null && m >= janela[0] && m <= janela[1]
    })
  })
}

/**
 * Uma linha por dia, para os registos.
 *
 * Sem isto a verificação era silenciosa: só se saberia que um dia ficou a meio
 * indo ver o roteiro. Assim fica no log de quem gerou, na altura em que gerou.
 */
export function resumirAgenda(dias, dayStart, dayEnd) {
  return (dias ?? []).map((d, i) => {
    const m = medirDia(d, dayStart, dayEnd)
    return {
      dia: d?.day ?? i + 1,
      actividades: (d?.activities ?? []).length,
      ocupado: paraHoras(m.ocupado),
      janela: paraHoras(m.janela),
      cobertura: `${Math.round(m.cobertura * 100)}%`,
      buracos: m.buracos.length,
    }
  })
}

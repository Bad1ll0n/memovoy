/**
 * Ler o `opening_hours` do OpenStreetMap e dizer se uma visita cabe lá dentro.
 *
 * Numa geração real apareceram os Museus do Vaticano marcados para as 18:05,
 * e fecham às 18:00. O modelo não tem forma de saber isto de maneira fiável, e
 * perguntar-lhe seria pedir-lhe que se verificasse a si próprio.
 *
 * O Nominatim devolve a etiqueta `opening_hours` no mesmo pedido que já
 * fazemos para geocodificar — é dado real, mantido por quem conhece o sítio, e
 * não custa uma chamada a mais. Exemplos verdadeiros, obtidos hoje:
 *
 *     Panteão            Mo-Sa 08:30-19:15; Su 09:00-17:45
 *     Galleria Borghese  Tu-Su 09:00-19:00            ← fechada à segunda
 *     Coliseu            Nov 01-Feb 15: 08:30-16:30; Apr-Aug: 08:30-19:15; ...
 *
 * ── O que este módulo NÃO faz ────────────────────────────────────────────────
 *
 * A especificação do opening_hours é grande: feriados, "sunset", semanas do
 * mês, intervalos relativos à Páscoa. Aqui trata-se o subconjunto que cobre a
 * esmagadora maioria dos museus e monumentos, e tudo o resto devolve
 * DESCONHECIDO em vez de um palpite.
 *
 * Isso é deliberado e é a decisão mais importante do ficheiro: dizer "fechado"
 * a quem está aberto manda deitar fora uma visita boa. Perante a dúvida,
 * calamo-nos.
 */

export const ABERTO       = 'aberto'
export const FECHADO      = 'fechado'
export const DESCONHECIDO = 'desconhecido'

const DIAS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']
const MESES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

const emMinutos = (hhmm) => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm)
  if (!m) return null
  const h = Number(m[1]), min = Number(m[2])
  // 24:00 aparece no OSM como fim de intervalo e significa meia-noite.
  if (h > 24 || min > 59) return null
  return h * 60 + min
}

/** "Mo-Sa" ou "Mo,We,Fr" ou "Tu" → conjunto de índices 0..6 (Domingo = 0). */
function diasDaRegra(texto) {
  const dias = new Set()
  for (const parte of texto.split(',')) {
    const intervalo = /^([A-Z][a-z])-([A-Z][a-z])$/.exec(parte.trim())
    if (intervalo) {
      const de = DIAS.indexOf(intervalo[1]), ate = DIAS.indexOf(intervalo[2])
      if (de === -1 || ate === -1) return null
      // Mo-Su é directo; Sa-Mo dá a volta ao fim de semana.
      for (let i = de; ; i = (i + 1) % 7) {
        dias.add(i)
        if (i === ate) break
      }
      continue
    }
    const um = DIAS.indexOf(parte.trim())
    if (um === -1) return null
    dias.add(um)
  }
  return dias
}

/** "09:00-19:00,14:00-18:00" → [[540,1140],[840,1080]] */
function intervalosDeHoras(texto) {
  const fora = []
  for (const parte of texto.split(',')) {
    const m = /^(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})$/.exec(parte.trim())
    if (!m) return null
    const de = emMinutos(m[1]), ate = emMinutos(m[2])
    if (de === null || ate === null) return null
    // Um intervalo que atravessa a meia-noite (22:00-02:00) é de bares, não de
    // museus. Trata-se como aberto até ao fim do dia — nunca fecha uma visita.
    fora.push([de, ate <= de ? 24 * 60 : ate])
  }
  return fora
}

/** "Nov 01-Feb 15" ou "Apr-Aug" → função que diz se uma data cai lá dentro. */
function periodoDoAno(texto) {
  const comDia = /^([A-Z][a-z]{2})\s*(\d{2})?\s*-\s*([A-Z][a-z]{2})\s*(\d{2})?$/.exec(texto.trim())
  const soUm   = /^([A-Z][a-z]{2})\s*(\d{2})?$/.exec(texto.trim())

  const chave = (mes, dia) => mes * 100 + dia

  if (comDia) {
    const m1 = MESES.indexOf(comDia[1]), m2 = MESES.indexOf(comDia[3])
    if (m1 === -1 || m2 === -1) return null
    const de  = chave(m1, comDia[2] ? Number(comDia[2]) : 1)
    const ate = chave(m2, comDia[4] ? Number(comDia[4]) : 31)
    // Nov-Feb dá a volta ao ano.
    return (mes, dia) => (de <= ate
      ? chave(mes, dia) >= de && chave(mes, dia) <= ate
      : chave(mes, dia) >= de || chave(mes, dia) <= ate)
  }
  if (soUm) {
    const m = MESES.indexOf(soUm[1])
    if (m === -1) return null
    const d = soUm[2] ? Number(soUm[2]) : null
    return (mes, dia) => mes === m && (d === null || dia === d)
  }
  return null
}

/**
 * Uma regra do opening_hours, já partida em pedaços.
 * Devolve null quando não se percebe — o que faz a avaliação inteira desistir.
 */
function lerRegra(bruta) {
  const texto = bruta.trim()
  if (texto === '') return null

  // ── Consumir o período do ano, se houver ──────────────────────────────────
  //
  // Partir aos dois pontos parecia óbvio e estava errado: em "Oct 08:30-18:30"
  // os primeiros dois pontos são os da HORA, e a regra saía como período
  // "Oct 08" com horas "30-18:30". O separador é ambíguo, portanto não se usa
  // — reconhece-se o período pela sua própria forma.
  //
  // Um período é um mês, opcionalmente com dia, opcionalmente até outro mês:
  // "Oct", "Nov 01-Feb 15", "Apr-Aug". Os dois pontos a seguir são opcionais
  // porque o OSM escreve das duas maneiras, às vezes na mesma etiqueta.
  // ── Separar "Dec 25" de "Oct 08:30" ───────────────────────────────────────
  //
  // Ambos são um mês seguido de dois dígitos. Num, os dígitos são o dia; no
  // outro, são a hora de abertura. Sem distinguir, "Oct 08:30-18:30" lia-se
  // como 8 de Outubro com horário "30-18:30" — que não é horário nenhum, e
  // fazia a leitura desistir do Coliseu inteiro.
  //
  // São precisas as DUAS verificações à frente:
  //
  //   (?!\d)      impede o recuo. Sem ela o motor experimentava " 0" em vez de
  //               " 08", o "8" seguinte deixava de ser dois pontos, e a outra
  //               verificação passava — o problema voltava por outro caminho.
  //   (?!:\d{2})  é a que separa mesmo: "08:30" é hora, "15: 08:30" é dia 15
  //               seguido do separador da regra.
  const MES = MESES.join('|')
  const DIA = '(?:\\s+\\d{1,2}(?!\\d)(?!:\\d{2}))?'
  const PERIODO = new RegExp(
    `^((?:${MES})${DIA}(?:\\s*-\\s*(?:${MES})${DIA})?)\\s*:?\\s*(.*)$`,
  )

  let periodo = null
  let resto = texto
  const comPeriodo = PERIODO.exec(texto)
  if (comPeriodo) {
    periodo = periodoDoAno(comPeriodo[1])
    if (!periodo) return null
    resto = comPeriodo[2].trim()
    // "Dec 25" sozinho, sem nada a seguir, não diz nada de útil.
    if (resto === '') return null
  }

  if (/^(off|closed)$/i.test(resto)) {
    return { periodo, dias: null, horas: null, fechado: true }
  }

  // "Mo-Sa 08:30-19:15" ou só "08:30-19:15".
  const comDias = /^([A-Z][a-z](?:[-,][A-Z][a-z])*)\s+(.+)$/.exec(resto)
  let dias = null
  let horasTexto = resto

  if (comDias) {
    dias = diasDaRegra(comDias[1])
    if (!dias) return null
    horasTexto = comDias[2].trim()
  }

  if (/^(off|closed)$/i.test(horasTexto)) {
    return { periodo, dias, horas: null, fechado: true }
  }

  const horas = intervalosDeHoras(horasTexto)
  if (!horas) return null
  return { periodo, dias, horas, fechado: false }
}

/**
 * A visita cabe dentro do horário?
 *
 * @param {string|null} horario   a etiqueta opening_hours do OSM
 * @param {string} dataISO        YYYY-MM-DD
 * @param {string} hora           HH:MM de início
 * @param {number} duracaoMin
 * @returns {{estado: string, motivo: string|null, horario: string|null}}
 */
export function avaliarHorario(horario, dataISO, hora, duracaoMin = 0) {
  const nada = { estado: DESCONHECIDO, motivo: null, horario: horario ?? null }
  if (typeof horario !== 'string' || horario.trim() === '') return nada

  const limpo = horario.trim()
  if (/^24\/7$/.test(limpo)) return { estado: ABERTO, motivo: null, horario: limpo }

  const inicio = emMinutos(hora)
  if (inicio === null) return nada

  const data = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dataISO ?? '')
  if (!data) return nada
  const d = new Date(Date.UTC(Number(data[1]), Number(data[2]) - 1, Number(data[3])))
  if (Number.isNaN(d.getTime())) return nada
  const diaSemana = d.getUTCDay()
  const mes = d.getUTCMonth()
  const diaMes = d.getUTCDate()

  // Feriados e outras extensões que não sabemos ler. Desistir é a resposta
  // certa: "fechado" a mais custa uma visita boa.
  if (/\b(PH|SH|easter|sunset|sunrise|dawn|dusk)\b/i.test(limpo)) return nada

  const regras = []
  for (const bruta of limpo.split(';')) {
    if (bruta.trim() === '') continue
    const r = lerRegra(bruta)
    if (!r) return nada   // uma regra que não se percebe invalida a leitura toda
    regras.push(r)
  }
  if (regras.length === 0) return nada

  // As regras do opening_hours leem-se por ordem: a última que se aplica ganha.
  // É assim que "Mo-Su 09:00-18:00; Dec 25 off" fecha o Natal.
  let aplicavel = null
  for (const r of regras) {
    if (r.periodo && !r.periodo(mes, diaMes)) continue
    if (r.dias && !r.dias.has(diaSemana)) continue
    aplicavel = r
  }

  if (!aplicavel) {
    // Nenhuma regra cobre este dia. No opening_hours isso quer dizer fechado —
    // é o que faz "Tu-Su 09:00-19:00" fechar a Galleria Borghese à segunda.
    return {
      estado: FECHADO,
      motivo: `fecha à ${nomeDoDia(diaSemana)}`,
      horario: limpo,
    }
  }

  if (aplicavel.fechado || !aplicavel.horas) {
    return { estado: FECHADO, motivo: `encerrado neste dia`, horario: limpo }
  }

  const fim = inicio + Math.max(0, duracaoMin)
  const cabe = aplicavel.horas.some(([de, ate]) => inicio >= de && fim <= ate)
  if (cabe) return { estado: ABERTO, motivo: null, horario: limpo }

  const abrePor = aplicavel.horas.map(([de, ate]) => `${texto(de)}-${texto(ate)}`).join(', ')
  const comecaDepoisDeFechar = aplicavel.horas.every(([, ate]) => inicio >= ate)
  const comecaAntesDeAbrir   = aplicavel.horas.every(([de]) => inicio < de)

  const motivo = comecaDepoisDeFechar ? `já fechou às ${hora} (abre ${abrePor})`
    : comecaAntesDeAbrir              ? `ainda não abriu às ${hora} (abre ${abrePor})`
    : `a visita passa da hora de fecho (aberto ${abrePor})`

  return { estado: FECHADO, motivo, horario: limpo }
}

function texto(minutos) {
  const h = Math.floor(minutos / 60) % 24
  const m = minutos % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

function nomeDoDia(i) {
  return ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'][i]
}

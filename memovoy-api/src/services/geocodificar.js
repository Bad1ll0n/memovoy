/**
 * Coordenadas para as actividades de um roteiro.
 *
 * Isto acontecia no browser: uma consulta ao Nominatim por actividade, a cada
 * visita, sem cache, com 1,1 segundos de intervalo entre elas por causa da
 * política do serviço. O utilizador esperava catorze segundos pelo mapa, e um
 * roteiro visto quinhentas vezes fazia quase vinte mil pedidos pelos mesmos
 * lugares.
 *
 * Havia ainda um pormenor invisível: o código enviava um cabeçalho User-Agent
 * a identificar a app, e os browsers PROÍBEM esse cabeçalho — era descartado em
 * silêncio. A política do Nominatim exige identificação, portanto a app julgava
 * cumpri-la e não cumpria. Do lado do servidor o cabeçalho passa de verdade.
 *
 * ── Como se resolve um nome ─────────────────────────────────────────────────
 *
 * Em cascata, do mais específico para o menos:
 *
 *   1. geoName + cidade + país      "Edinburgh Castle, Edinburgh, UK"
 *   2. morada + cidade + país       para quando o geoName não existe
 *   3. nome da actividade + cidade  último recurso, o mais ambíguo
 *
 * E o resultado é verificado contra o centro do destino. Um ponto a mais de
 * 150 km não é do destino — foi assim que apareceram marcadores sobre Cuba num
 * roteiro de Edimburgo, porque "Old Town" sem contexto procura no mundo todo.
 *
 * Descartar é melhor do que mostrar: um mapa com menos pinos é incompleto, um
 * mapa com pinos errados é falso, e o segundo faz desconfiar de tudo o resto.
 */

import { query } from '../db/pool.js'
import { avaliarHorario, ABERTO, FECHADO } from './horarios.js'
import { correspondeAoPedido, limparTermo } from './nomeDoLugar.js'

const NOMINATIM = 'https://nominatim.openstreetmap.org/search'

/** Ver o comentário do módulo. Largo de propósito: Londres inteira cabe em 40. */
export const RAIO_PLAUSIVEL_KM = 150

/** A política do Nominatim é um pedido por segundo. 1,1 dá folga ao relógio. */
const INTERVALO_MS = 1100

let ultimoPedido = 0

async function respeitarRitmo() {
  const desde = Date.now() - ultimoPedido
  if (desde < INTERVALO_MS) {
    await new Promise((r) => setTimeout(r, INTERVALO_MS - desde))
  }
  ultimoPedido = Date.now()
}

export function distanciaKm(a, b) {
  const R = 6371
  const rad = (g) => (g * Math.PI) / 180
  const dLat = rad(b.lat - a.lat)
  const dLon = rad(b.lon - a.lon)
  const h = Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h))
}

/**
 * A chave da cache.
 *
 * Inclui cidade e país porque o nome de um lugar só é único dentro de uma
 * cidade — "Old Town" em Edimburgo e em Praga são lugares diferentes.
 * Normalizada para que diferenças de espaços ou maiúsculas não criem entradas
 * duplicadas do mesmo sítio.
 */
export function chaveDeCache(nome, destino, pais) {
  return [nome, destino, pais]
    .filter(Boolean)
    .map((p) => String(p).trim().toLowerCase().replace(/\s+/g, ' '))
    .join('|')
}

async function lerCache(chave) {
  const { rows } = await query(
    'SELECT lat, lon, estado, horario, nome_confirmado FROM lugares WHERE chave = $1',
    [chave],
  )
  return rows[0] ?? null
}

async function gravarCache(chave, resultado, nomeObtido, nomeConfirmado = false) {
  await query(
    `INSERT INTO lugares (chave, lat, lon, nome_obtido, estado, horario, nome_confirmado)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (chave) DO UPDATE
       SET lat = $2, lon = $3, nome_obtido = $4, estado = $5, horario = $6,
           nome_confirmado = $7, criado_em = NOW()`,
    [chave, resultado?.lat ?? null, resultado?.lon ?? null, nomeObtido ?? null,
     resultado ? 'ok' : 'sem_resposta', resultado?.horario ?? null, nomeConfirmado],
  )
}

/** Uma chamada ao Nominatim, já com o ritmo respeitado. */
async function perguntarAoNominatim(consulta) {
  await respeitarRitmo()
  try {
    // extratags=1 traz o `opening_hours` do OpenStreetMap no MESMO pedido.
    // Não custa uma chamada a mais e é a única fonte de horários que temos que
    // não seja perguntar ao modelo — que não os sabe de forma fiável.
    // namedetails=1 traz todos os nomes do sítio, em todas as línguas. É o que
    // permite confirmar que o resultado é o sítio pedido — ver nomeDoLugar.js.
    //
    // limit=5 e não 1. O primeiro resultado nem sempre é o melhor: os Museus
    // Vaticanos existem no OSM como dois nós, e é o SEGUNDO que tem o horário
    // de abertura. A pedir só um, perdia-se — e não por o sítio não estar lá.
    const url = `${NOMINATIM}?format=json&limit=5&extratags=1&namedetails=1&q=${encodeURIComponent(consulta)}`
    const res = await fetch(url, {
      headers: {
        // Do lado do servidor este cabeçalho passa mesmo. A política do
        // Nominatim exige-o, e no browser era descartado em silêncio.
        'User-Agent': 'Memovoy/1.0 (https://github.com/Bad1ll0n/memovoy)',
        'Accept-Language': 'pt',
      },
      signal: AbortSignal.timeout(10_000),
    })
    if (!res.ok) return null
    const dados = await res.json()
    if (!Array.isArray(dados) || dados.length === 0) return null
    return dados.map((d) => ({
      lat: parseFloat(d.lat),
      lon: parseFloat(d.lon),
      nome: d.display_name ?? null,
      // Vem em bruto, tal como está no OSM. Interpretar aqui era perder o que
      // ainda não sabemos ler — ver services/horarios.js.
      horario: d.extratags?.opening_hours ?? null,
      bruto: d,
    }))
  } catch {
    return null
  }
}

/**
 * Junta a cidade e o país ao termo — mas só quando ainda lá não estão.
 *
 * Acrescentávamos sempre, e as moradas que o modelo escreve já trazem tudo:
 *
 *     "Via del Casaletto, 45, 00151 Roma RM, Itália"  +  ", Roma, Itália"
 *
 * O Nominatim não devolve nada para isso. Sem a duplicação devolve a Trattoria
 * da Cesare, com horário de abertura e tudo. Era o que estava a deitar fora a
 * maior parte dos restaurantes: numa medição real, só 17% das actividades
 * ficavam com horário conhecido.
 */
export function comContexto(termo, destino, pais) {
  const jaTem = (parte) => {
    if (!parte) return true
    return termo.toLowerCase().includes(String(parte).toLowerCase())
  }
  return [termo, jaTem(destino) ? null : destino, jaTem(pais) ? null : pais]
    .filter(Boolean)
    .join(', ')
}

/**
 * Procura um termo, com contexto e sem ele.
 *
 * A segunda tentativa existe por causa dos enclaves: os Museus Vaticanos ficam
 * na Cidade do Vaticano, e procurá-los "em Roma, Itália" não devolve nada.
 * `Musei Vaticani` sozinho devolve. É o género de sítio que um roteiro de Roma
 * inclui sempre e que a regra geral exclui.
 *
 * Procurar sem cidade traz de volta o risco que a cidade servia para evitar —
 * "Old Town" sozinho pode cair em qualquer continente. Não é problema porque
 * quem chama compara o resultado com o centro do destino e recusa o que está a
 * mais de 150 km. Foi essa verificação que apanhou os marcadores sobre Cuba num
 * roteiro de Edimburgo, e é ela que torna esta segunda tentativa segura.
 */
/**
 * De vários candidatos, o melhor — e diz porquê.
 *
 * O Nominatim ordena por relevância própria, que não é a nossa. Medido:
 *
 *   "Vatican Museums"       o resultado 0 e o 1 são o MESMO museu em dois nós
 *                           do OSM, e só o 1 tem horário de abertura
 *   "St. Peter's Basilica"  o resultado 0 é outra igreja com nome parecido
 *
 * A ordem de preferência é: nome confirmado E com horário, depois nome
 * confirmado, e só depois o primeiro que vier. Nunca se prefere ter horário a
 * ter o sítio certo — um horário do edifício errado é pior do que nenhum.
 */
function escolherCandidato(candidatos, termo, ehNome) {
  if (!ehNome) return { escolhido: candidatos[0], confirmado: true }

  const avaliados = candidatos.map((c) => ({
    c,
    ...correspondeAoPedido(termo, c.bruto ?? {}),
  }))
  const confirmados = avaliados.filter((a) => a.coincide)

  if (confirmados.length > 0) {
    const comHorario = confirmados.find((a) => a.c.horario)
    return { escolhido: (comHorario ?? confirmados[0]).c, confirmado: true }
  }

  // Nenhum é o sítio pedido. Devolve-se o primeiro na mesma — a coordenada
  // aproximada ainda serve para o mapa, e a distância continua a protegê-la —
  // mas marcado como não confirmado, o que impede o horário de ser usado.
  const melhor = avaliados.reduce((a, b) => (b.melhor > a.melhor ? b : a))
  return { escolhido: candidatos[0], confirmado: false, quaseFoi: melhor }
}

/**
 * Procura um termo, com contexto e sem ele.
 *
 * A segunda tentativa começou por existir para os enclaves — os Museus
 * Vaticanos ficam na Cidade do Vaticano e procurá-los "em Roma, Itália" não
 * devolve nada. Depois descobriu-se que o caso mais comum é pior: a procura COM
 * cidade devolve o sítio ERRADO, e por isso a repetição nunca chegava a
 * acontecer. "St. Peter's Basilica, Roma, Itália" traz San Pietro in Vincoli;
 * "St. Peter's Basilica" sozinho traz a basílica certa, com horário.
 *
 * Por isso repete-se também quando o que veio não corresponde ao pedido, e não
 * só quando não veio nada.
 *
 * Procurar sem cidade traz de volta o risco que a cidade servia para evitar —
 * "Old Town" sozinho cai em qualquer continente. Não é problema porque quem
 * chama compara o resultado com o centro do destino e recusa acima de 150 km.
 */
async function procurarComContexto(termo, destino, pais, ehNome) {
  const comCidade = comContexto(termo, destino, pais)
  const candidatos = await perguntarAoNominatim(comCidade)

  let melhorTentativa = null
  if (candidatos) {
    const r = escolherCandidato(candidatos, termo, ehNome)
    if (r.confirmado) return r
    melhorTentativa = r
  }

  // Só vale a pena repetir se a primeira tentativa acrescentou alguma coisa.
  if (comCidade === termo) return melhorTentativa

  const semCidade = await perguntarAoNominatim(termo)
  if (semCidade) {
    const r = escolherCandidato(semCidade, termo, ehNome)
    if (r.confirmado) return r
    melhorTentativa ??= r
  }
  return melhorTentativa
}

/**
 * Resolve um lugar, com cache e validação.
 *
 * @param {object} act        actividade com geoName, address e name
 * @param {string} destino    cidade do roteiro
 * @param {string} pais
 * @param {{lat:number,lon:number}|null} centro  para validar a distância
 * @returns {Promise<{lat:number,lon:number}|null>}
 */
export async function resolverLugar(act, destino, pais, centro) {
  // As tentativas, da mais específica para a menos. O nome da actividade é o
  // último recurso porque é o mais ambíguo — "Almoço no mercado" não é um
  // lugar, e uma consulta assim traz seja o que for.
  //
  // O tipo de cada tentativa importa para a confirmação do nome. Procurar por
  // MORADA e depois exigir que o nome devolvido se pareça com a morada é uma
  // recusa garantida: "Via del Casaletto, 45" encontrou a Trattoria da Cesare
  // — o sítio certo — e comparar os dois textos dá zero. A morada já é o
  // identificador; se o Nominatim acertou no número da porta, acertou no sítio.
  //
  // O nome vai limpo do que o modelo lhe põe à frente. Comparar nomes já
  // ignorava "Almoço –" e "Visita ao", mas a PROCURA levava-os na mesma, e o
  // Nominatim procura pelo texto todo: o Ristorante Il Falchetto tem horário no
  // OSM e não o encontrávamos por causa da palavra "Almoço".
  //
  // E o NOME vem antes da morada, o que inverte a ordem original.
  //
  // O nome estava em último "porque é o mais ambíguo" — verdade enquanto não
  // havia forma de verificar o que voltava. Agora há: o termo vai limpo e o
  // resultado é confirmado contra os nomes do sítio, portanto um match errado
  // é recusado em vez de aceite.
  //
  // A morada tem um problema que só se vê a medir: aterra no EDIFÍCIO e não no
  // estabelecimento. "Via dei Fori Imperiali, 12" devolve o número de porta, que
  // não tem horário; "Ristorante Il Falchetto" devolve o restaurante, que tem.
  // Sete dos oito restaurantes de um roteiro resolviam pela morada e ficavam sem
  // horário por causa disso.
  const tentativas = [
    { termo: act.geoName, ehNome: true },
    { termo: limparTermo(act.name), ehNome: true },
    { termo: act.address, ehNome: false },
  ]
    .map((t) => ({ ...t, termo: (t.termo ?? '').trim() }))
    .filter((t) => t.termo)

  for (const { termo, ehNome } of tentativas) {
    const chave = chaveDeCache(termo, destino, pais)

    const emCache = await lerCache(chave)
    if (emCache) {
      // Uma falha em cache é uma resposta: não vale a pena voltar a perguntar
      // por um nome que já se sabe que não existe.
      if (emCache.estado !== 'ok') continue
      return {
        lat: emCache.lat,
        lon: emCache.lon,
        // O horário só sai quando o nome do sítio confirmou o pedido. Procurar
        // "St. Peter's Basilica" devolve San Pietro in Vincoli — outra igreja,
        // a 1,5 km, com horário próprio. O pino a 1,5 km é um erro que se vê; o
        // horário do edifício errado não.
        horario: emCache.nome_confirmado ? (emCache.horario ?? null) : null,
      }
    }

    const tentativa = await procurarComContexto(termo, destino, pais, ehNome)

    if (!tentativa) {
      await gravarCache(chave, null, null)
      continue
    }

    const { escolhido: r, confirmado, quaseFoi } = tentativa

    if (centro && distanciaKm(centro, r) > RAIO_PLAUSIVEL_KM) {
      // Guardado como 'longe' e não como 'ok': é um resultado, mas não é este
      // resultado. Fica registado para se poder ver depois o que falha mais.
      await query(
        `INSERT INTO lugares (chave, lat, lon, nome_obtido, estado)
         VALUES ($1, NULL, NULL, $2, 'longe')
         ON CONFLICT (chave) DO UPDATE SET estado = 'longe', nome_obtido = $2, criado_em = NOW()`,
        [chave, r.nome],
      )
      continue
    }

    if (!confirmado && r.horario) {
      console.info(`[geo] "${termo}" trouxe "${quaseFoi?.nomeQueBateu ?? '?'}" ` +
        `(${(quaseFoi?.melhor ?? 0).toFixed(2)}) — horário descartado`)
    }

    await gravarCache(chave, r, r.nome, confirmado)
    return { lat: r.lat, lon: r.lon, horario: confirmado ? (r.horario ?? null) : null }
  }

  return null
}

/**
 * Resolve o centro do destino, para servir de referência às actividades.
 * Passa pela mesma cache.
 */
export async function resolverDestino(destino, pais) {
  if (!destino) return null
  return resolverLugar({ geoName: destino }, null, pais, null)
}

/**
 * Preenche lat/lon nas actividades de um roteiro.
 *
 * Devolve o objecto `data` com as coordenadas onde foi possível, e a contagem
 * do que ficou por resolver — que a interface precisa para dizer "três
 * actividades sem localização" em vez de as deixar desaparecer em silêncio.
 */
/**
 * Quão longe do resto do dia é longe de mais.
 *
 * O raio de 150 km serve para excluir outro continente e não serve para mais
 * nada. Um jantar na Piazza di Santa Maria in Trastevere — morada certa —
 * ficou geocodificado a 8,6 km para leste do centro de Roma, e passou: 8,6 é
 * muito menos que 150.
 *
 * O que denuncia um pino errado não é a distância ao destino, é a distância ao
 * RESTO DO DIA. Um dia inteiro no Vaticano com uma paragem a dez quilómetros
 * não é um dia com uma paragem longe; é um pino no sítio errado.
 *
 * 6 km é generoso para um dia a pé — Roma do Vaticano ao Coliseu são 4 — e
 * continua a apanhar o caso de 8,6. Um dia que seja mesmo espalhado tem a
 * mediana espalhada também, e por isso não se auto-acusa.
 */
export const DESVIO_MAXIMO_NO_DIA_KM = 6

/** A mediana é melhor que a média: um outlier não puxa por ela. */
function centroDoDia(actividades) {
  const pontos = actividades.filter((a) => typeof a.lat === 'number' && typeof a.lon === 'number')
  if (pontos.length < 3) return null   // com dois pontos não há "resto do dia"

  const mediana = (valores) => {
    const ordenados = [...valores].sort((x, y) => x - y)
    const meio = Math.floor(ordenados.length / 2)
    return ordenados.length % 2 ? ordenados[meio] : (ordenados[meio - 1] + ordenados[meio]) / 2
  }
  return { lat: mediana(pontos.map((p) => p.lat)), lon: mediana(pontos.map((p) => p.lon)) }
}

/**
 * Tira as coordenadas às actividades que caíram longe do resto do dia.
 *
 * Tira e não corrige: não sabemos onde é o sítio certo, só sabemos que não é
 * ali. Sem coordenadas a actividade aparece como "sem localização no mapa", que
 * é verdade — e um mapa com menos pinos é incompleto, enquanto um mapa com
 * pinos errados é falso.
 *
 * @returns {number} quantas foram descartadas
 */
export function descartarPinosForaDoDia(dias, limiteKm = DESVIO_MAXIMO_NO_DIA_KM) {
  let descartados = 0

  for (const dia of dias ?? []) {
    const acts = (dia?.activities ?? []).filter((a) => a.type !== 'transport')
    const centro = centroDoDia(acts)
    if (!centro) continue

    for (const a of acts) {
      if (typeof a.lat !== 'number' || typeof a.lon !== 'number') continue
      const d = distanciaKm(centro, a)
      if (d <= limiteKm) continue

      console.warn(`[geo] "${a.name}" ficou a ${d.toFixed(1)} km do resto do dia ${dia.day} — pino descartado`)
      a.lat = null
      a.lon = null
      // O horário vinha do mesmo resultado. Se o sítio está errado, o horário
      // também está — e um horário errado é pior do que nenhum.
      delete a.horarioConhecido
      delete a.avisoDeHorario
      descartados++
    }
  }
  return descartados
}

export async function preencherCoordenadas(data, destino, pais) {
  const centro = await resolverDestino(destino, pais)
  let resolvidas = 0
  let semLocalizacao = 0
  let comHorario = 0
  let fechados = 0

  for (const dia of data?.days ?? []) {
    for (const act of dia?.activities ?? []) {
      // O transporte não é um lugar, é o caminho entre dois.
      if (act.type === 'transport') continue

      const p = await resolverLugar(act, destino, pais, centro)
      if (p) {
        act.lat = p.lat
        act.lon = p.lon
        resolvidas++

        // ── A porta está aberta a esta hora? ────────────────────────────────
        //
        // Numa geração real apareceram os Museus do Vaticano às 18:05, e fecham
        // às 18:00. Esta verificação só é possível aqui: o horário chega junto
        // com as coordenadas, e é a DATA do dia que decide — a Galleria
        // Borghese fecha à segunda, e o Coliseu fecha duas horas mais cedo no
        // Inverno do que em Agosto.
        //
        // O aviso fica na actividade e não a apaga. Quem revê é que decide: a
        // etiqueta do OSM pode estar desactualizada, e deitar fora uma visita
        // por causa disso era pior do que a assinalar.
        const veredicto = avaliarHorario(p.horario, dia.date, act.time, act.durationMin ?? 0)
        if (veredicto.estado === FECHADO) {
          act.avisoDeHorario  = veredicto.motivo
          act.horarioConhecido = veredicto.horario
          fechados++
        } else if (veredicto.estado === ABERTO) {
          act.horarioConhecido = veredicto.horario
          comHorario++
        }
      } else {
        semLocalizacao++
      }
    }
  }

  // Última passagem: os pinos que caíram longe do resto do dia. Só é possível
  // aqui, depois de todas as coordenadas estarem preenchidas — um ponto isolado
  // não se distingue de um ponto certo sem ter os outros com que o comparar.
  const forasDeMao = descartarPinosForaDoDia(data?.days)
  if (forasDeMao > 0) {
    resolvidas -= forasDeMao
    semLocalizacao += forasDeMao
  }

  return { data, resolvidas, semLocalizacao, comHorario, fechados, forasDeMao }
}

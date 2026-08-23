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
    'SELECT lat, lon, estado, horario FROM lugares WHERE chave = $1',
    [chave],
  )
  return rows[0] ?? null
}

async function gravarCache(chave, resultado, nomeObtido) {
  await query(
    `INSERT INTO lugares (chave, lat, lon, nome_obtido, estado, horario)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (chave) DO UPDATE
       SET lat = $2, lon = $3, nome_obtido = $4, estado = $5, horario = $6, criado_em = NOW()`,
    [chave, resultado?.lat ?? null, resultado?.lon ?? null, nomeObtido ?? null,
     resultado ? 'ok' : 'sem_resposta', resultado?.horario ?? null],
  )
}

/** Uma chamada ao Nominatim, já com o ritmo respeitado. */
async function perguntarAoNominatim(consulta) {
  await respeitarRitmo()
  try {
    // extratags=1 traz o `opening_hours` do OpenStreetMap no MESMO pedido.
    // Não custa uma chamada a mais e é a única fonte de horários que temos que
    // não seja perguntar ao modelo — que não os sabe de forma fiável.
    const url = `${NOMINATIM}?format=json&limit=1&extratags=1&q=${encodeURIComponent(consulta)}`
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
    if (!dados?.[0]) return null
    return {
      lat: parseFloat(dados[0].lat),
      lon: parseFloat(dados[0].lon),
      nome: dados[0].display_name ?? null,
      // Vem em bruto, tal como está no OSM. Interpretar aqui era perder o que
      // ainda não sabemos ler — ver services/horarios.js.
      horario: dados[0].extratags?.opening_hours ?? null,
    }
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
async function procurarComContexto(termo, destino, pais) {
  const comCidade = comContexto(termo, destino, pais)
  const r = await perguntarAoNominatim(comCidade)
  if (r) return r

  // Só vale a pena repetir se a primeira tentativa acrescentou alguma coisa.
  if (comCidade === termo) return null
  return perguntarAoNominatim(termo)
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
  const tentativas = [act.geoName, act.address, act.name]
    .map((t) => (t ?? '').trim())
    .filter(Boolean)

  for (const termo of tentativas) {
    const chave = chaveDeCache(termo, destino, pais)

    const emCache = await lerCache(chave)
    if (emCache) {
      // Uma falha em cache é uma resposta: não vale a pena voltar a perguntar
      // por um nome que já se sabe que não existe.
      if (emCache.estado !== 'ok') continue
      return { lat: emCache.lat, lon: emCache.lon, horario: emCache.horario ?? null }
    }

    const r = await procurarComContexto(termo, destino, pais)

    if (!r) {
      await gravarCache(chave, null, null)
      continue
    }

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

    await gravarCache(chave, r, r.nome)
    return { lat: r.lat, lon: r.lon, horario: r.horario ?? null }
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

  return { data, resolvidas, semLocalizacao, comHorario, fechados }
}

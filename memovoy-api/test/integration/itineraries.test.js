import { test, describe, before, after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { query } from '../../src/db/pool.js'
import { criarApp, fecharApp, limparBaseDeDados, registarUtilizador, comToken } from './helpers.js'

// itineraries.js é o maior ficheiro de rotas do projecto. Aqui cobre-se o que
// não depende da IA: criação, visibilidade público/privado, e as escritas com
// verificação de dono. Os endpoints de geração ficam de fora — precisariam da
// API da Groq.

let app
let autor, intruso

before(async () => { app = await criarApp() })
after(async () => { await fecharApp(app) })

beforeEach(async () => {
  await limparBaseDeDados()
  autor   = await registarUtilizador(app)
  intruso = await registarUtilizador(app)
})

const DIA_COM_ACTIVIDADE = {
  days: [{
    day: 1,
    activities: [{
      time: '09:00', name: 'Coliseu', description: 'Visita guiada',
      cost: 18, currency: 'EUR', type: 'visit',
    }],
  }],
}

async function criarRoteiro(quem, corpo = {}) {
  const res = await app.inject({
    method: 'POST', url: '/itineraries',
    headers: comToken(quem.accessToken),
    payload: {
      title: 'Roma em 3 dias',
      destination: 'Roma',
      data: DIA_COM_ACTIVIDADE,
      ...corpo,
    },
  })
  if (res.statusCode >= 300) throw new Error(`criar roteiro falhou (${res.statusCode}): ${res.body}`)
  return JSON.parse(res.body).id
}

describe('POST /itineraries', () => {
  test('exige autenticação', async () => {
    const res = await app.inject({
      method: 'POST', url: '/itineraries',
      payload: { title: 'x', destination: 'y', data: { days: [] } },
    })
    assert.equal(res.statusCode, 401)
  })

  test('cria e atribui ao autor', async () => {
    const id = await criarRoteiro(autor)

    const { rows } = await query('SELECT user_id, title, ai_generated FROM itineraries WHERE id = $1', [id])
    assert.equal(rows[0].user_id, autor.user.id)
    assert.equal(rows[0].title, 'Roma em 3 dias')
    assert.equal(rows[0].ai_generated, false, 'criado à mão, não gerado por IA')
  })

  test('nasce público por omissão', async () => {
    const id = await criarRoteiro(autor)
    const { rows } = await query('SELECT is_public FROM itineraries WHERE id = $1', [id])
    assert.equal(rows[0].is_public, true)
  })

  test('rejeita título vazio', async () => {
    const res = await app.inject({
      method: 'POST', url: '/itineraries',
      headers: comToken(autor.accessToken),
      payload: { title: '', destination: 'Roma', data: { days: [] } },
    })
    assert.equal(res.statusCode, 400)
  })

  test('rejeita data em formato errado', async () => {
    const res = await app.inject({
      method: 'POST', url: '/itineraries',
      headers: comToken(autor.accessToken),
      payload: { title: 'x', destination: 'Roma', startDate: '01-01-2026', data: { days: [] } },
    })
    assert.equal(res.statusCode, 400)
  })

  test('rejeita corpo sem o objecto data', async () => {
    const res = await app.inject({
      method: 'POST', url: '/itineraries',
      headers: comToken(autor.accessToken),
      payload: { title: 'x', destination: 'Roma' },
    })
    assert.equal(res.statusCode, 400)
  })
})

describe('visibilidade', () => {
  test('roteiro público é visível a outro utilizador', async () => {
    const id = await criarRoteiro(autor)

    const res = await app.inject({
      method: 'GET', url: `/itineraries/${id}`,
      headers: comToken(intruso.accessToken),
    })

    assert.equal(res.statusCode, 200)
  })

  test('roteiro privado devolve 404 a terceiros — nem confirma que existe', async () => {
    const id = await criarRoteiro(autor)
    await query('UPDATE itineraries SET is_public = FALSE WHERE id = $1', [id])

    const res = await app.inject({
      method: 'GET', url: `/itineraries/${id}`,
      headers: comToken(intruso.accessToken),
    })

    assert.equal(res.statusCode, 404)
    assert.doesNotMatch(res.body, /Roma/)
  })

  test('o dono vê o próprio roteiro privado', async () => {
    const id = await criarRoteiro(autor)
    await query('UPDATE itineraries SET is_public = FALSE WHERE id = $1', [id])

    const res = await app.inject({
      method: 'GET', url: `/itineraries/${id}`,
      headers: comToken(autor.accessToken),
    })

    assert.equal(res.statusCode, 200)
  })

  test('GET /itineraries/mine só devolve os do próprio', async () => {
    await criarRoteiro(autor)

    const res = await app.inject({
      method: 'GET', url: '/itineraries/mine',
      headers: comToken(intruso.accessToken),
    })

    assert.equal(res.statusCode, 200)
    const body = JSON.parse(res.body)
    const lista = Array.isArray(body) ? body : (body.itineraries ?? [])
    assert.equal(lista.length, 0)
  })
})

describe('PATCH /itineraries/:id', () => {
  test('o dono altera os metadados', async () => {
    const id = await criarRoteiro(autor)

    const res = await app.inject({
      method: 'PATCH', url: `/itineraries/${id}`,
      headers: comToken(autor.accessToken),
      payload: { title: 'Roma em 5 dias', is_public: false },
    })

    assert.ok(res.statusCode < 300, `veio ${res.statusCode}: ${res.body}`)
    const { rows } = await query('SELECT title, is_public FROM itineraries WHERE id = $1', [id])
    assert.equal(rows[0].title, 'Roma em 5 dias')
    assert.equal(rows[0].is_public, false)
  })

  test('terceiro não altera — 403 e o título fica intacto', async () => {
    const id = await criarRoteiro(autor)

    const res = await app.inject({
      method: 'PATCH', url: `/itineraries/${id}`,
      headers: comToken(intruso.accessToken),
      payload: { title: 'Assaltado' },
    })

    assert.equal(res.statusCode, 403)
    const { rows } = await query('SELECT title FROM itineraries WHERE id = $1', [id])
    assert.equal(rows[0].title, 'Roma em 3 dias')
  })

  test('terceiro não torna público um roteiro privado alheio', async () => {
    const id = await criarRoteiro(autor)
    await query('UPDATE itineraries SET is_public = FALSE WHERE id = $1', [id])

    const res = await app.inject({
      method: 'PATCH', url: `/itineraries/${id}`,
      headers: comToken(intruso.accessToken),
      payload: { is_public: true },
    })

    assert.equal(res.statusCode, 403)
    const { rows } = await query('SELECT is_public FROM itineraries WHERE id = $1', [id])
    assert.equal(rows[0].is_public, false)
  })
})

describe('actividades', () => {
  const NOVA = {
    time: '11:00', name: 'Fórum Romano', description: 'Ruínas',
    cost: 12, currency: 'EUR', type: 'visit',
  }

  test('o dono edita uma actividade', async () => {
    const id = await criarRoteiro(autor)

    const res = await app.inject({
      method: 'PATCH', url: `/itineraries/${id}/activity`,
      headers: comToken(autor.accessToken),
      payload: { dayIndex: 0, activityIndex: 0, activity: NOVA },
    })

    assert.equal(res.statusCode, 200)
    const { rows } = await query('SELECT data FROM itineraries WHERE id = $1', [id])
    assert.equal(rows[0].data.days[0].activities[0].name, 'Fórum Romano')
  })

  test('terceiro não edita — 403 e a actividade fica intacta', async () => {
    const id = await criarRoteiro(autor)

    const res = await app.inject({
      method: 'PATCH', url: `/itineraries/${id}/activity`,
      headers: comToken(intruso.accessToken),
      payload: { dayIndex: 0, activityIndex: 0, activity: NOVA },
    })

    assert.equal(res.statusCode, 403)
    const { rows } = await query('SELECT data FROM itineraries WHERE id = $1', [id])
    assert.equal(rows[0].data.days[0].activities[0].name, 'Coliseu')
  })

  test('índice fora do intervalo devolve 400, não 500', async () => {
    const id = await criarRoteiro(autor)

    const res = await app.inject({
      method: 'PATCH', url: `/itineraries/${id}/activity`,
      headers: comToken(autor.accessToken),
      payload: { dayIndex: 99, activityIndex: 99, activity: NOVA },
    })

    assert.equal(res.statusCode, 400)
  })

  test('tipo de actividade desconhecido é rejeitado', async () => {
    const id = await criarRoteiro(autor)

    const res = await app.inject({
      method: 'PATCH', url: `/itineraries/${id}/activity`,
      headers: comToken(autor.accessToken),
      payload: { dayIndex: 0, activityIndex: 0, activity: { ...NOVA, type: 'inventado' } },
    })

    assert.equal(res.statusCode, 400)
  })
})

describe('DELETE /itineraries/:id', () => {
  test('o dono elimina', async () => {
    const id = await criarRoteiro(autor)

    const res = await app.inject({
      method: 'DELETE', url: `/itineraries/${id}`,
      headers: comToken(autor.accessToken),
    })

    assert.equal(res.statusCode, 200)
    const { rows } = await query('SELECT 1 FROM itineraries WHERE id = $1', [id])
    assert.equal(rows.length, 0)
  })

  test('terceiro não elimina — 403 e o roteiro sobrevive', async () => {
    const id = await criarRoteiro(autor)

    const res = await app.inject({
      method: 'DELETE', url: `/itineraries/${id}`,
      headers: comToken(intruso.accessToken),
    })

    assert.equal(res.statusCode, 403)
    const { rows } = await query('SELECT 1 FROM itineraries WHERE id = $1', [id])
    assert.equal(rows.length, 1)
  })

  test('roteiro inexistente devolve 404', async () => {
    const res = await app.inject({
      method: 'DELETE', url: '/itineraries/00000000-0000-0000-0000-000000000000',
      headers: comToken(autor.accessToken),
    })
    assert.equal(res.statusCode, 404)
  })
})

describe('GET /itineraries/:id/export.ics', () => {
  // A autenticação aqui é opcional. Um pedido anónimo a um roteiro público tem
  // de funcionar — é o caso de uso de partilhar o link do calendário.
  test('roteiro público exporta sem sessão', async () => {
    const id = await criarRoteiro(autor)

    const res = await app.inject({ method: 'GET', url: `/itineraries/${id}/export.ics` })

    assert.equal(res.statusCode, 200)
    assert.match(res.body, /^BEGIN:VCALENDAR/)
    assert.match(res.body, /END:VCALENDAR/)
    assert.ok(res.body.includes('Memovoy'), 'o PRODID identifica o produto')
  })

  test('o dono exporta o próprio roteiro privado', async () => {
    const id = await criarRoteiro(autor)
    await query('UPDATE itineraries SET is_public = FALSE WHERE id = $1', [id])

    const res = await app.inject({
      method: 'GET', url: `/itineraries/${id}/export.ics`,
      headers: comToken(autor.accessToken),
    })

    assert.equal(res.statusCode, 200)
    assert.match(res.body, /^BEGIN:VCALENDAR/)
  })

  test('roteiro privado alheio dá 403 a quem tem sessão', async () => {
    const id = await criarRoteiro(autor)
    await query('UPDATE itineraries SET is_public = FALSE WHERE id = $1', [id])

    const res = await app.inject({
      method: 'GET', url: `/itineraries/${id}/export.ics`,
      headers: comToken(intruso.accessToken),
    })

    assert.equal(res.statusCode, 403)
  })

  test('roteiro privado dá 401 a quem não tem sessão', async () => {
    const id = await criarRoteiro(autor)
    await query('UPDATE itineraries SET is_public = FALSE WHERE id = $1', [id])

    const res = await app.inject({ method: 'GET', url: `/itineraries/${id}/export.ics` })

    assert.equal(res.statusCode, 401)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// A janela do dia
//
// O agente escolhia as horas sozinho — e escolhia sempre parecido: manhã cedo
// até à noite. Para quem viaja com crianças, chega num voo da tarde, ou não se
// levanta às oito, o roteiro nascia errado e corrigi-lo era editar actividade
// a actividade.
//
// A geração em si precisa da API da Groq e fica de fora. O que se testa aqui é
// o que a rota recusa ANTES de gastar uma chamada, porque é isso que impede
// uma janela absurda de chegar ao modelo.
describe('a janela do dia é validada antes de chegar ao modelo', () => {
  const pedidoBase = {
    destination: 'Sevilha',
    startDate:   '2027-04-10',
    endDate:     '2027-04-12',
    groupType:   'family',
    travelStyle: ['culture'],
    transport:   ['walk'],
    budget:      600,
  }

  const gerar = (extra) => app.inject({
    method: 'POST', url: '/itineraries/generate',
    headers: comToken(autor.accessToken),
    payload: { ...pedidoBase, ...extra },
  })

  test('um dia que acaba antes de começar é recusado', async () => {
    // Não é um dia curto, é um pedido impossível. Sem esta verificação o
    // modelo recebia a janela invertida e devolvia seja o que fosse — sem
    // erro nenhum, e sem ninguém perceber porquê.
    const res = await gerar({ dayStart: '20:00', dayEnd: '09:00' })

    assert.equal(res.statusCode, 400)
    assert.match(res.json().message, /depois da hora de início/i)
  })

  test('uma janela curta demais é recusada', async () => {
    const res = await gerar({ dayStart: '10:00', dayEnd: '11:00' })

    assert.equal(res.statusCode, 400)
    assert.match(res.json().message, /pelo menos/i)
  })

  test('horas mal formadas são recusadas', async () => {
    // '24:00' é o caso traiçoeiro: lê-se como meia-noite e existe em ISO 8601,
    // mas a coluna TIME recusa-o. Apanhá-lo aqui evita um erro de base de
    // dados longe de onde o valor entrou.
    for (const hora of ['24:00', '9:00', '09:60', 'manhã']) {
      const res = await gerar({ dayStart: hora })
      assert.equal(res.statusCode, 400, `${hora} devia ser recusada`)
    }
  })

  test('início igual ao fim é recusado', async () => {
    const res = await gerar({ dayStart: '14:00', dayEnd: '14:00' })
    assert.equal(res.statusCode, 400)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Um roteiro gerado ainda não é um roteiro
//
// O ecrã de revisão dizia "decide se queres guardar", mas a decisão já estava
// tomada: a geração gravava antes de responder, sem tocar em is_public — que é
// TRUE por omissão. O roteiro nascia PÚBLICO e aparecia na lista, na pesquisa e
// no explorar, tudo antes de alguém carregar em "Guardar". Quem gerasse e
// descartasse tinha-o visível para toda a gente no meio.
//
// A geração precisa da API da Groq e não corre aqui. O que se testa é a máquina
// de estados: um roteiro por confirmar comporta-se como não existindo, e o
// /confirm é o que o traz à existência.
describe('um roteiro por confirmar não aparece em lado nenhum', () => {
  /** Põe um roteiro no estado em que a geração o deixa. */
  async function porPorConfirmar(id) {
    await query(
      'UPDATE itineraries SET confirmado = FALSE, is_public = FALSE WHERE id = $1',
      [id],
    )
  }

  test('não entra na lista do próprio dono', async () => {
    // O caso que mais irrita: fechar o separador a meio da revisão e ficar com
    // um roteiro na lista que nunca se chegou a querer.
    const id = await criarRoteiro(autor)
    await porPorConfirmar(id)

    const res = await app.inject({
      method: 'GET', url: '/itineraries/mine',
      headers: comToken(autor.accessToken),
    })

    assert.equal(res.statusCode, 200)
    const ids = res.json().itineraries.map((i) => i.id)
    assert.ok(!ids.includes(id), 'apareceu na lista sem ter sido confirmado')
  })

  test('um estranho não lhe chega, mesmo sabendo o id', async () => {
    const id = await criarRoteiro(autor)
    await porPorConfirmar(id)

    const res = await app.inject({
      method: 'GET', url: `/itineraries/${id}`,
      headers: comToken(intruso.accessToken),
    })

    assert.equal(res.statusCode, 404)
  })

  test('mas o dono vê-o — é o que torna a revisão possível', async () => {
    const id = await criarRoteiro(autor)
    await porPorConfirmar(id)

    const res = await app.inject({
      method: 'GET', url: `/itineraries/${id}`,
      headers: comToken(autor.accessToken),
    })

    assert.equal(res.statusCode, 200)
    assert.equal(res.json().id, id)
  })

  test('confirmar traz o roteiro à existência', async () => {
    const id = await criarRoteiro(autor)
    await porPorConfirmar(id)

    const res = await app.inject({
      method: 'POST', url: `/itineraries/${id}/confirm`,
      headers: comToken(autor.accessToken),
      payload: {},
    })
    assert.equal(res.statusCode, 200)
    assert.equal(res.json().jaEstava, false)

    const lista = await app.inject({
      method: 'GET', url: '/itineraries/mine',
      headers: comToken(autor.accessToken),
    })
    assert.ok(lista.json().itineraries.map((i) => i.id).includes(id))

    const deFora = await app.inject({
      method: 'GET', url: `/itineraries/${id}`,
      headers: comToken(intruso.accessToken),
    })
    assert.equal(deFora.statusCode, 200, 'depois de confirmado é visível')
  })

  test('confirmar em privado guarda sem publicar', async () => {
    // Antes desta rota a pergunta nem existia: tudo o que era gerado nascia
    // público, e não havia forma de guardar um roteiro só para si.
    const id = await criarRoteiro(autor)
    await porPorConfirmar(id)

    await app.inject({
      method: 'POST', url: `/itineraries/${id}/confirm`,
      headers: comToken(autor.accessToken),
      payload: { isPublic: false },
    })

    const meu = await app.inject({
      method: 'GET', url: '/itineraries/mine', headers: comToken(autor.accessToken),
    })
    assert.ok(meu.json().itineraries.map((i) => i.id).includes(id), 'está na minha lista')

    const alheio = await app.inject({
      method: 'GET', url: `/itineraries/${id}`, headers: comToken(intruso.accessToken),
    })
    assert.equal(alheio.statusCode, 404, 'e continua invisível para os outros')
  })

  test('confirmar duas vezes não estraga a segunda', async () => {
    // Um duplo clique ou uma repetição de rede não podem dar erro — nem voltar
    // a mexer no is_public de um roteiro que o dono já tornou privado depois.
    const id = await criarRoteiro(autor)
    await porPorConfirmar(id)

    const primeira = await app.inject({
      method: 'POST', url: `/itineraries/${id}/confirm`,
      headers: comToken(autor.accessToken), payload: { isPublic: false },
    })
    const segunda = await app.inject({
      method: 'POST', url: `/itineraries/${id}/confirm`,
      headers: comToken(autor.accessToken), payload: { isPublic: true },
    })

    assert.equal(primeira.json().jaEstava, false)
    assert.equal(segunda.statusCode, 200)
    assert.equal(segunda.json().jaEstava, true)

    const { rows } = await query('SELECT is_public FROM itineraries WHERE id = $1', [id])
    assert.equal(rows[0].is_public, false, 'a segunda chamada não repôs o público')
  })

  test('só o dono pode confirmar', async () => {
    const id = await criarRoteiro(autor)
    await porPorConfirmar(id)

    const res = await app.inject({
      method: 'POST', url: `/itineraries/${id}/confirm`,
      headers: comToken(intruso.accessToken), payload: {},
    })

    assert.equal(res.statusCode, 403)
  })
})

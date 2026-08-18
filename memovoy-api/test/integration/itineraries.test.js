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

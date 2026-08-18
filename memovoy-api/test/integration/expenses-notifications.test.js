import { test, describe, before, after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { query } from '../../src/db/pool.js'
import { criarApp, fecharApp, limparBaseDeDados, registarUtilizador, comToken } from './helpers.js'

// Duas áreas por cobrir com risco diferente: despesas mexem em dinheiro dentro
// de roteiros, notificações são privadas por natureza.

let app
let ana, bruno

before(async () => { app = await criarApp() })
after(async () => { await fecharApp(app) })

beforeEach(async () => {
  await limparBaseDeDados()
  ana   = await registarUtilizador(app)
  bruno = await registarUtilizador(app)
})

async function criarRoteiro(quem) {
  const res = await app.inject({
    method: 'POST', url: '/itineraries',
    headers: comToken(quem.accessToken),
    payload: { title: 'Roma', destination: 'Roma', data: { days: [] } },
  })
  return JSON.parse(res.body).id
}

async function criarDespesa(quem, itineraryId, corpo = {}) {
  const res = await app.inject({
    method: 'POST', url: `/expenses/itinerary/${itineraryId}`,
    headers: comToken(quem.accessToken),
    payload: { amount: 25.5, currency: 'EUR', category: 'refeições', description: 'Jantar', ...corpo },
  })
  return res
}

describe('despesas — autorização', () => {
  test('o dono do roteiro adiciona despesas', async () => {
    const roteiro = await criarRoteiro(ana)

    const res = await criarDespesa(ana, roteiro)

    assert.equal(res.statusCode, 201)
    const { rows } = await query('SELECT user_id, amount FROM expenses WHERE itinerary_id = $1', [roteiro])
    assert.equal(rows.length, 1)
    assert.equal(rows[0].user_id, ana.user.id)
  })

  test('quem não é dono do roteiro não adiciona despesas', async () => {
    const roteiro = await criarRoteiro(ana)

    const res = await criarDespesa(bruno, roteiro)

    assert.equal(res.statusCode, 403)
    const { rows } = await query('SELECT count(*)::int AS n FROM expenses WHERE itinerary_id = $1', [roteiro])
    assert.equal(rows[0].n, 0)
  })

  test('roteiro inexistente devolve 404', async () => {
    const res = await criarDespesa(ana, '00000000-0000-0000-0000-000000000000')
    assert.equal(res.statusCode, 404)
  })

  test('a listagem só mostra as despesas de quem pergunta', async () => {
    const roteiro = await criarRoteiro(ana)
    await criarDespesa(ana, roteiro, { description: 'jantar-da-ana' })

    const res = await app.inject({
      method: 'GET', url: `/expenses/itinerary/${roteiro}`,
      headers: comToken(bruno.accessToken),
    })

    assert.equal(res.statusCode, 200)
    const body = JSON.parse(res.body)
    assert.equal(body.expenses.length, 0)
    assert.equal(body.total, 0)
    assert.doesNotMatch(res.body, /jantar-da-ana/)
  })

  test('terceiro não edita despesa alheia', async () => {
    const roteiro = await criarRoteiro(ana)
    await criarDespesa(ana, roteiro)
    const { rows } = await query('SELECT id FROM expenses WHERE itinerary_id = $1', [roteiro])

    const res = await app.inject({
      method: 'PATCH', url: `/expenses/${rows[0].id}`,
      headers: comToken(bruno.accessToken),
      payload: { amount: 1 },
    })

    assert.equal(res.statusCode, 403)
    const depois = await query('SELECT amount FROM expenses WHERE id = $1', [rows[0].id])
    assert.equal(Number(depois.rows[0].amount), 25.5)
  })

  test('terceiro não apaga despesa alheia', async () => {
    const roteiro = await criarRoteiro(ana)
    await criarDespesa(ana, roteiro)
    const { rows } = await query('SELECT id FROM expenses WHERE itinerary_id = $1', [roteiro])

    const res = await app.inject({
      method: 'DELETE', url: `/expenses/${rows[0].id}`,
      headers: comToken(bruno.accessToken),
    })

    assert.equal(res.statusCode, 403)
    const depois = await query('SELECT 1 FROM expenses WHERE id = $1', [rows[0].id])
    assert.equal(depois.rows.length, 1)
  })

  test('exige autenticação', async () => {
    const roteiro = await criarRoteiro(ana)
    const res = await app.inject({ method: 'GET', url: `/expenses/itinerary/${roteiro}` })
    assert.equal(res.statusCode, 401)
  })
})

describe('despesas — totais e validação', () => {
  test('soma o total e agrupa por categoria', async () => {
    const roteiro = await criarRoteiro(ana)
    await criarDespesa(ana, roteiro, { amount: 10, category: 'refeições' })
    await criarDespesa(ana, roteiro, { amount: 15, category: 'refeições' })
    await criarDespesa(ana, roteiro, { amount: 40, category: 'transporte' })

    const res = await app.inject({
      method: 'GET', url: `/expenses/itinerary/${roteiro}`,
      headers: comToken(ana.accessToken),
    })

    const body = JSON.parse(res.body)
    assert.equal(body.total, 65)
    assert.equal(body.byCategory['refeições'], 25)
    assert.equal(body.byCategory['transporte'], 40)
  })

  test('rejeita categoria desconhecida', async () => {
    const roteiro = await criarRoteiro(ana)
    const res = await criarDespesa(ana, roteiro, { category: 'inventada' })
    assert.equal(res.statusCode, 400)
  })

  test('rejeita montante negativo', async () => {
    const roteiro = await criarRoteiro(ana)
    const res = await criarDespesa(ana, roteiro, { amount: -10 })
    assert.equal(res.statusCode, 400)
  })

  test('apagar a despesa do próprio funciona', async () => {
    const roteiro = await criarRoteiro(ana)
    await criarDespesa(ana, roteiro)
    const { rows } = await query('SELECT id FROM expenses WHERE itinerary_id = $1', [roteiro])

    const res = await app.inject({
      method: 'DELETE', url: `/expenses/${rows[0].id}`,
      headers: comToken(ana.accessToken),
    })

    assert.equal(res.statusCode, 200)
    const depois = await query('SELECT 1 FROM expenses WHERE id = $1', [rows[0].id])
    assert.equal(depois.rows.length, 0)
  })
})

describe('notificações', () => {
  /** Provoca uma notificação real: o Bruno segue a Ana. */
  async function brunoSegueAna() {
    await app.inject({
      method: 'POST', url: `/users/${ana.user.id}/follow`,
      headers: comToken(bruno.accessToken),
    })
  }

  test('seguir gera notificação para quem é seguido', async () => {
    await brunoSegueAna()

    const res = await app.inject({
      method: 'GET', url: '/notifications',
      headers: comToken(ana.accessToken),
    })

    assert.equal(res.statusCode, 200)
    const body = JSON.parse(res.body)
    const lista = Array.isArray(body) ? body : body.notifications
    assert.equal(lista.length, 1)
  })

  test('quem age não recebe notificação da própria acção', async () => {
    await brunoSegueAna()

    const res = await app.inject({
      method: 'GET', url: '/notifications',
      headers: comToken(bruno.accessToken),
    })

    const body = JSON.parse(res.body)
    const lista = Array.isArray(body) ? body : body.notifications
    assert.equal(lista.length, 0)
  })

  test('as notificações de terceiros nunca aparecem', async () => {
    await brunoSegueAna()

    const { rows } = await query('SELECT recipient_id FROM notifications')
    assert.ok(rows.every((r) => r.recipient_id === ana.user.id), 'só a Ana devia ter notificações')

    const res = await app.inject({
      method: 'GET', url: '/notifications',
      headers: comToken(bruno.accessToken),
    })
    assert.doesNotMatch(res.body, new RegExp(bruno.dados.username + ' começou a seguir'))
  })

  test('a contagem de não lidas reflecte o que existe', async () => {
    await brunoSegueAna()

    const res = await app.inject({
      method: 'GET', url: '/notifications/unread-count',
      headers: comToken(ana.accessToken),
    })

    assert.equal(res.statusCode, 200)
    const body = JSON.parse(res.body)
    const n = typeof body === 'number' ? body : (body.count ?? body.unread)
    assert.equal(n, 1)
  })

  test('a contagem de outro utilizador é zero', async () => {
    await brunoSegueAna()

    const res = await app.inject({
      method: 'GET', url: '/notifications/unread-count',
      headers: comToken(bruno.accessToken),
    })

    const body = JSON.parse(res.body)
    const n = typeof body === 'number' ? body : (body.count ?? body.unread)
    assert.equal(n, 0)
  })

  test('a listagem exige autenticação', async () => {
    const res = await app.inject({ method: 'GET', url: '/notifications' })
    assert.equal(res.statusCode, 401)
  })

  // O PATCH exige os quatro campos: e uma substituicao total, nao um patch
  // parcial, apesar do verbo. Um payload incompleto da 400.
  test('guardar preferências exige o objecto completo', async () => {
    const parcial = await app.inject({
      method: 'PATCH', url: '/notifications/settings',
      headers: comToken(ana.accessToken),
      payload: { follows: false },
    })
    assert.equal(parcial.statusCode, 400)
  })

  test('as preferências são por utilizador e sobrevivem à releitura', async () => {
    const res = await app.inject({
      method: 'PATCH', url: '/notifications/settings',
      headers: comToken(ana.accessToken),
      payload: { likes: true, comments: true, follows: false, messages: true },
    })
    assert.equal(res.statusCode, 200)

    const daAna = await app.inject({
      method: 'GET', url: '/notifications/settings',
      headers: comToken(ana.accessToken),
    })
    assert.equal(JSON.parse(daAna.body).follows, false)

    const doBruno = await app.inject({
      method: 'GET', url: '/notifications/settings',
      headers: comToken(bruno.accessToken),
    })
    assert.equal(JSON.parse(doBruno.body).follows, true, 'as preferencias do Bruno nao podiam ter mudado')
  })
})

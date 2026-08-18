import { test, describe, before, after } from 'node:test'
import assert from 'node:assert/strict'

// O que a API faz quando o Postgres não responde. Nenhum teste cobria isto, e é
// um cenário garantido em produção: reinício da base de dados, failover, pool
// esgotado.
//
// Corre num processo próprio (o runner do node isola cada ficheiro), por isso
// pode apontar o DATABASE_URL para um porto morto sem afectar os outros testes.
// A porta 1 recusa de imediato — nada de esperar por timeouts.
process.env.DATABASE_URL = 'postgresql://ninguem:nada@127.0.0.1:1/inexistente'

const { buildApp } = await import('../../src/app.js')
const { pool }     = await import('../../src/db/pool.js')

let app

before(async () => {
  const construido = await buildApp({ rateLimit: false })
  app = construido.app
  await app.ready()
})

after(async () => {
  await app.close()
  await pool.end().catch(() => {})
})

describe('a app arranca mesmo sem base de dados', () => {
  test('buildApp não rebenta — a ligação é preguiçosa', () => {
    assert.ok(app, 'a app devia ter sido construída')
  })

  test('/health responde 200 — não toca na base de dados', async () => {
    const res = await app.inject({ method: 'GET', url: '/health' })

    assert.equal(res.statusCode, 200)
    assert.equal(JSON.parse(res.body).status, 'ok')
  })
})

describe('rotas que precisam da base de dados', () => {
  test('registo devolve 500, não fica pendurado', async () => {
    const res = await app.inject({
      method: 'POST', url: '/auth/register',
      payload: { username: 'alguem', email: 'a@exemplo.pt', password: 'PasswordValida1' },
    })

    assert.equal(res.statusCode, 500)
  })

  test('login devolve 500', async () => {
    const res = await app.inject({
      method: 'POST', url: '/auth/login',
      payload: { email: 'a@exemplo.pt', password: 'PasswordValida1' },
    })

    assert.equal(res.statusCode, 500)
  })

  test('listagem pública devolve 500 em vez de resposta vazia', async () => {
    // Uma lista vazia seria pior: o frontend mostrava "sem roteiros" quando o
    // que se passa é que a base de dados não responde.
    const res = await app.inject({ method: 'GET', url: '/itineraries' })

    assert.equal(res.statusCode, 500)
  })
})

describe('o erro não deixa escapar detalhes da ligação', () => {
  /** Rotas que falham na base de dados, para inspeccionar o corpo do erro. */
  const rotas = [
    ['POST', '/auth/register', { username: 'alguem', email: 'a@exemplo.pt', password: 'PasswordValida1' }],
    ['POST', '/auth/login',    { email: 'a@exemplo.pt', password: 'PasswordValida1' }],
    ['GET',  '/itineraries',   undefined],
  ]

  for (const [method, url, payload] of rotas) {
    test(`${method} ${url} não revela credenciais nem host`, async () => {
      const res = await app.inject({ method, url, ...(payload ? { payload } : {}) })
      const corpo = res.body

      assert.doesNotMatch(corpo, /ninguem/,     'utilizador da ligação não pode sair')
      assert.doesNotMatch(corpo, /nada/,        'password da ligação não pode sair')
      assert.doesNotMatch(corpo, /127\.0\.0\.1/, 'host não pode sair')
      assert.doesNotMatch(corpo, /inexistente/, 'nome da base de dados não pode sair')
      assert.doesNotMatch(corpo, /postgresql:\/\//, 'a connection string não pode sair')
    })
  }

  test('a resposta de erro é JSON, não um stack trace em texto', async () => {
    const res = await app.inject({ method: 'GET', url: '/itineraries' })

    assert.match(res.headers['content-type'] ?? '', /application\/json/)
    assert.doesNotMatch(res.body, /at .*\.js:\d+/, 'sem stack trace no corpo')
  })
})

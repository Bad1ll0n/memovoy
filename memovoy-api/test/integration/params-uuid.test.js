import { test, describe, before, after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { criarApp, fecharApp, limparBaseDeDados, registarUtilizador, comToken, criarPost } from './helpers.js'

// Ids de rota iam directos para SQL contra colunas UUID. Um id malformado fazia
// o Postgres rebentar na conversão e a API respondia 500 — estado errado para o
// que é um erro do cliente. Um hook valida-os antes de chegarem à base de dados.

let app
let ana

const MALFORMADOS = [
  ['texto simples',        'nao-e-uuid'],
  ['número',               '12345'],
  ['uuid truncado',        '00000000-0000-0000-0000'],
  ['uuid com letra a mais', '00000000-0000-0000-0000-0000000000000'],
  ['caracteres fora do hex', 'zzzzzzzz-zzzz-zzzz-zzzz-zzzzzzzzzzzz'],
  ['tentativa de injecção', "1' OR '1'='1"],
]

const UUID_VALIDO_INEXISTENTE = '00000000-0000-0000-0000-000000000000'

before(async () => { app = await criarApp() })
after(async () => { await fecharApp(app) })

beforeEach(async () => {
  await limparBaseDeDados()
  ana = await registarUtilizador(app)
})

describe('ids malformados devolvem 400, não 500', () => {
  for (const [descricao, id] of MALFORMADOS) {
    test(`GET /users/${descricao}`, async () => {
      const res = await app.inject({ method: 'GET', url: `/users/${encodeURIComponent(id)}` })
      assert.equal(res.statusCode, 400)
    })
  }

  test('GET /posts/:id', async () => {
    const res = await app.inject({ method: 'GET', url: '/posts/nao-e-uuid' })
    assert.equal(res.statusCode, 400)
  })

  test('GET /itineraries/:id', async () => {
    const res = await app.inject({ method: 'GET', url: '/itineraries/nao-e-uuid' })
    assert.equal(res.statusCode, 400)
  })

  test('DELETE /posts/:id — a validação corre antes da autenticação falhar', async () => {
    const res = await app.inject({
      method: 'DELETE', url: '/posts/nao-e-uuid',
      headers: comToken(ana.accessToken),
    })
    assert.equal(res.statusCode, 400)
  })

  test('rota aninhada com :itineraryId', async () => {
    const res = await app.inject({
      method: 'GET', url: '/expenses/itinerary/nao-e-uuid',
      headers: comToken(ana.accessToken),
    })
    assert.equal(res.statusCode, 400)
  })

  test('a mensagem não revela nada da base de dados', async () => {
    const res = await app.inject({ method: 'GET', url: '/posts/nao-e-uuid' })

    assert.doesNotMatch(res.body, /uuid/i, 'sem detalhes do tipo da coluna')
    assert.doesNotMatch(res.body, /SELECT|FROM|WHERE/i, 'sem SQL')
    assert.doesNotMatch(res.body, /postgres/i)
  })
})

describe('ids válidos continuam a passar', () => {
  test('uuid válido mas inexistente dá 404, não 400', async () => {
    const res = await app.inject({ method: 'GET', url: `/users/${UUID_VALIDO_INEXISTENTE}` })
    assert.equal(res.statusCode, 404)
  })

  test('uuid em maiúsculas é aceite', async () => {
    const res = await app.inject({ method: 'GET', url: `/users/${UUID_VALIDO_INEXISTENTE.toUpperCase()}` })
    assert.notEqual(res.statusCode, 400)
  })

  test('um post real continua acessível pelo seu id', async () => {
    const post = await criarPost(app, ana.accessToken, { caption: 'existe' })

    const res = await app.inject({ method: 'GET', url: `/posts/${post.id}` })
    assert.equal(res.statusCode, 200)
  })
})

describe('parâmetros que não são UUID ficam de fora da validação', () => {
  // jti é VARCHAR(64) e o token de convite é um código — validá-los como UUID
  // rejeitaria entrada legítima.

  test('revogar sessão com jti inexistente dá 404, não 400', async () => {
    const res = await app.inject({
      method: 'DELETE', url: '/users/me/sessions/nao-e-uuid',
      headers: comToken(ana.accessToken),
    })

    assert.equal(res.statusCode, 404, 'o jti não é uma coluna UUID')
  })

  test('rotas estáticas não são confundidas com :id', async () => {
    const res = await app.inject({
      method: 'GET', url: '/users/me',
      headers: comToken(ana.accessToken),
    })

    assert.equal(res.statusCode, 200, '/users/me tem de continuar a resolver para a rota estática')
  })
})

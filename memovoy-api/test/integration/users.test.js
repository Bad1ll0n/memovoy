import { test, describe, before, after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { query } from '../../src/db/pool.js'
import { criarApp, fecharApp, limparBaseDeDados, registarUtilizador, comToken, criarPost } from './helpers.js'

// users.js são 665 linhas e concentram o que mais custa ter errado: seguir,
// sessões de dispositivo, e a eliminação de conta do RGPD — que tem de apagar
// mesmo, não só marcar.

let app
let ana, bruno

before(async () => { app = await criarApp() })
after(async () => { await fecharApp(app) })

beforeEach(async () => {
  await limparBaseDeDados()
  ana   = await registarUtilizador(app)
  bruno = await registarUtilizador(app)
})

describe('seguir e deixar de seguir', () => {
  test('seguir cria a relação', async () => {
    const res = await app.inject({
      method: 'POST', url: `/users/${bruno.user.id}/follow`,
      headers: comToken(ana.accessToken),
    })

    assert.equal(res.statusCode, 201)
    const { rows } = await query(
      'SELECT 1 FROM follows WHERE follower_id = $1 AND following_id = $2',
      [ana.user.id, bruno.user.id],
    )
    assert.equal(rows.length, 1)
  })

  test('seguir duas vezes não duplica', async () => {
    for (let i = 0; i < 2; i++) {
      await app.inject({
        method: 'POST', url: `/users/${bruno.user.id}/follow`,
        headers: comToken(ana.accessToken),
      })
    }

    const { rows } = await query(
      'SELECT count(*)::int AS n FROM follows WHERE follower_id = $1 AND following_id = $2',
      [ana.user.id, bruno.user.id],
    )
    assert.equal(rows[0].n, 1)
  })

  test('não se segue a si próprio', async () => {
    const res = await app.inject({
      method: 'POST', url: `/users/${ana.user.id}/follow`,
      headers: comToken(ana.accessToken),
    })
    assert.equal(res.statusCode, 400)
  })

  test('deixar de seguir remove a relação', async () => {
    await app.inject({
      method: 'POST', url: `/users/${bruno.user.id}/follow`,
      headers: comToken(ana.accessToken),
    })

    const res = await app.inject({
      method: 'DELETE', url: `/users/${bruno.user.id}/follow`,
      headers: comToken(ana.accessToken),
    })

    assert.equal(res.statusCode, 200)
    const { rows } = await query(
      'SELECT 1 FROM follows WHERE follower_id = $1 AND following_id = $2',
      [ana.user.id, bruno.user.id],
    )
    assert.equal(rows.length, 0)
  })

  test('seguir é direccional — não cria a relação inversa', async () => {
    await app.inject({
      method: 'POST', url: `/users/${bruno.user.id}/follow`,
      headers: comToken(ana.accessToken),
    })

    const { rows } = await query(
      'SELECT 1 FROM follows WHERE follower_id = $1 AND following_id = $2',
      [bruno.user.id, ana.user.id],
    )
    assert.equal(rows.length, 0)
  })

  test('as listagens reflectem a relação', async () => {
    await app.inject({
      method: 'POST', url: `/users/${bruno.user.id}/follow`,
      headers: comToken(ana.accessToken),
    })

    const seguidores = await app.inject({ method: 'GET', url: `/users/${bruno.user.id}/followers` })
    const aSeguir    = await app.inject({ method: 'GET', url: `/users/${ana.user.id}/following` })

    assert.match(seguidores.body, new RegExp(ana.user.username))
    assert.match(aSeguir.body, new RegExp(bruno.user.username))
  })

  test('exige autenticação', async () => {
    const res = await app.inject({ method: 'POST', url: `/users/${bruno.user.id}/follow` })
    assert.equal(res.statusCode, 401)
  })
})

describe('PATCH /users/me', () => {
  test('actualiza os campos do perfil', async () => {
    const res = await app.inject({
      method: 'PATCH', url: '/users/me',
      headers: comToken(ana.accessToken),
      payload: { bio: 'Viajo devagar.', location: 'Porto' },
    })

    assert.equal(res.statusCode, 200)
    const { rows } = await query('SELECT bio, location FROM users WHERE id = $1', [ana.user.id])
    assert.equal(rows[0].bio, 'Viajo devagar.')
    assert.equal(rows[0].location, 'Porto')
  })

  test('não deixa mudar o username de outra pessoa por acidente', async () => {
    // O endpoint só actua sobre request.user.id — não aceita um alvo.
    await app.inject({
      method: 'PATCH', url: '/users/me',
      headers: comToken(ana.accessToken),
      payload: { bio: 'alterado' },
    })

    const { rows } = await query('SELECT bio FROM users WHERE id = $1', [bruno.user.id])
    assert.equal(rows[0].bio, null, 'o perfil do outro não podia ter mudado')
  })

  test('exige autenticação', async () => {
    const res = await app.inject({ method: 'PATCH', url: '/users/me', payload: { bio: 'x' } })
    assert.equal(res.statusCode, 401)
  })
})

describe('sessões de dispositivo', () => {
  test('o registo cria uma sessão', async () => {
    const res = await app.inject({
      method: 'GET', url: '/users/me/sessions',
      headers: comToken(ana.accessToken),
    })

    assert.equal(res.statusCode, 200)
    const { sessions } = JSON.parse(res.body)
    assert.ok(sessions.length >= 1, 'o registo devia ter deixado uma sessão')
  })

  test('só se vêem as próprias sessões', async () => {
    const res = await app.inject({
      method: 'GET', url: '/users/me/sessions',
      headers: comToken(bruno.accessToken),
    })

    const { sessions } = JSON.parse(res.body)
    const { rows } = await query('SELECT jti FROM device_sessions WHERE user_id = $1', [bruno.user.id])
    assert.deepEqual(
      sessions.map((s) => s.jti).sort(),
      rows.map((r) => r.jti).sort(),
    )
  })

  test('revogar a própria sessão apaga-a e marca o token como revogado', async () => {
    const lista = await app.inject({
      method: 'GET', url: '/users/me/sessions',
      headers: comToken(ana.accessToken),
    })
    const { jti } = JSON.parse(lista.body).sessions[0]

    const res = await app.inject({
      method: 'DELETE', url: `/users/me/sessions/${jti}`,
      headers: comToken(ana.accessToken),
    })

    assert.equal(res.statusCode, 200)

    const sessoes = await query('SELECT 1 FROM device_sessions WHERE jti = $1', [jti])
    assert.equal(sessoes.rows.length, 0)

    const revogados = await query('SELECT 1 FROM revoked_tokens WHERE jti = $1', [jti])
    assert.equal(revogados.rows.length, 1, 'o token tem de ficar na lista de revogados')
  })

  test('não se revoga a sessão de outra pessoa', async () => {
    const lista = await app.inject({
      method: 'GET', url: '/users/me/sessions',
      headers: comToken(ana.accessToken),
    })
    const { jti } = JSON.parse(lista.body).sessions[0]

    const res = await app.inject({
      method: 'DELETE', url: `/users/me/sessions/${jti}`,
      headers: comToken(bruno.accessToken),
    })

    assert.equal(res.statusCode, 404, 'nem confirma que a sessão existe')

    const sessoes = await query('SELECT 1 FROM device_sessions WHERE jti = $1', [jti])
    assert.equal(sessoes.rows.length, 1, 'a sessão da Ana devia continuar de pé')
  })
})

describe('DELETE /users/me — eliminação de conta (RGPD)', () => {
  test('apaga mesmo o utilizador', async () => {
    const res = await app.inject({
      method: 'DELETE', url: '/users/me',
      headers: comToken(ana.accessToken),
    })

    assert.equal(res.statusCode, 200)
    const { rows } = await query('SELECT 1 FROM users WHERE id = $1', [ana.user.id])
    assert.equal(rows.length, 0)
  })

  test('arrasta o conteúdo: posts, roteiros, seguidores e sessões', async () => {
    await criarPost(app, ana.accessToken, { caption: 'a apagar' })
    await app.inject({
      method: 'POST', url: '/itineraries',
      headers: comToken(ana.accessToken),
      payload: { title: 'Roteiro', destination: 'Lisboa', data: { days: [] } },
    })
    await app.inject({
      method: 'POST', url: `/users/${bruno.user.id}/follow`,
      headers: comToken(ana.accessToken),
    })

    await app.inject({ method: 'DELETE', url: '/users/me', headers: comToken(ana.accessToken) })

    for (const [tabela, coluna] of [
      ['posts', 'user_id'],
      ['itineraries', 'user_id'],
      ['device_sessions', 'user_id'],
      ['follows', 'follower_id'],
    ]) {
      const { rows } = await query(`SELECT count(*)::int AS n FROM ${tabela} WHERE ${coluna} = $1`, [ana.user.id])
      assert.equal(rows[0].n, 0, `${tabela} devia ter ficado sem linhas da conta apagada`)
    }
  })

  test('não toca no conteúdo de mais ninguém', async () => {
    await criarPost(app, bruno.accessToken, { caption: 'do bruno' })

    await app.inject({ method: 'DELETE', url: '/users/me', headers: comToken(ana.accessToken) })

    const { rows } = await query('SELECT count(*)::int AS n FROM posts WHERE user_id = $1', [bruno.user.id])
    assert.equal(rows[0].n, 1)
  })

  test('deixa registo na auditoria', async () => {
    await app.inject({ method: 'DELETE', url: '/users/me', headers: comToken(ana.accessToken) })

    const { rows } = await query("SELECT count(*)::int AS n FROM audit_logs WHERE action = 'account_delete'")
    assert.ok(rows[0].n >= 1, 'a eliminação devia ficar registada')
  })

  test('exige autenticação', async () => {
    const res = await app.inject({ method: 'DELETE', url: '/users/me' })
    assert.equal(res.statusCode, 401)
  })
})

describe('GET /users/me/export — exportação RGPD', () => {
  test('devolve os dados do próprio como ficheiro', async () => {
    await criarPost(app, ana.accessToken, { caption: 'exportável' })

    const res = await app.inject({
      method: 'GET', url: '/users/me/export',
      headers: comToken(ana.accessToken),
    })

    assert.equal(res.statusCode, 200)
    assert.match(res.headers['content-disposition'] ?? '', /attachment/)
    assert.match(res.body, /exportável/)
  })

  test('não inclui dados de outros utilizadores', async () => {
    await criarPost(app, bruno.accessToken, { caption: 'post-do-bruno-nao-exportar' })

    const res = await app.inject({
      method: 'GET', url: '/users/me/export',
      headers: comToken(ana.accessToken),
    })

    assert.doesNotMatch(res.body, /post-do-bruno-nao-exportar/)
  })

  test('exige autenticação', async () => {
    const res = await app.inject({ method: 'GET', url: '/users/me/export' })
    assert.equal(res.statusCode, 401)
  })
})

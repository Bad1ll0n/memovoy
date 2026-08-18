import { test, describe, before, after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { query } from '../../src/db/pool.js'
import { criarApp, fecharApp, limparBaseDeDados, registarUtilizador, comToken, criarPost } from './helpers.js'

// Correcções dos bugs encontrados na passagem de QA pré-release. Cada bloco
// fixa um deles para não voltar.

let app
let ana, bob

before(async () => { app = await criarApp() })
after(async () => { await fecharApp(app) })

beforeEach(async () => {
  await limparBaseDeDados()
  ana = await registarUtilizador(app)
  bob = await registarUtilizador(app)
})

describe('BUG-001 — notificação de badge', () => {
  test('publicar o primeiro post gera badge E notificação', async () => {
    await criarPost(app, ana.accessToken, { caption: 'o primeiro' })

    // A atribuição é fire-and-forget; dar-lhe tempo de assentar.
    await new Promise((r) => setTimeout(r, 800))

    const badges = await query('SELECT count(*)::int n FROM user_badges WHERE user_id = $1', [ana.user.id])
    const notifs = await query(
      "SELECT target_url FROM notifications WHERE recipient_id = $1 AND type = 'badge'",
      [ana.user.id],
    )

    assert.ok(badges.rows[0].n > 0, 'devia ter sido atribuído um badge')
    assert.ok(notifs.rows.length > 0, 'o utilizador tem de ser notificado do badge que ganhou')
  })

  test('o target_url da notificação aponta para o perfil', async () => {
    await criarPost(app, ana.accessToken, { caption: 'o primeiro' })
    await new Promise((r) => setTimeout(r, 800))

    const { rows } = await query(
      "SELECT target_url FROM notifications WHERE recipient_id = $1 AND type = 'badge' LIMIT 1",
      [ana.user.id],
    )

    assert.equal(rows[0]?.target_url, `/profile/${ana.user.id}`)
  })

  test('a notificação aparece na listagem do próprio', async () => {
    await criarPost(app, ana.accessToken, { caption: 'o primeiro' })
    await new Promise((r) => setTimeout(r, 800))

    const res = await app.inject({ method: 'GET', url: '/notifications', headers: comToken(ana.accessToken) })
    const body = JSON.parse(res.body)
    const lista = Array.isArray(body) ? body : body.notifications

    assert.ok(lista.some((n) => n.type === 'badge'), 'o badge tem de aparecer nas notificações')
  })
})

describe('BUG-002 — cursor de paginação inválido', () => {
  const comCursor = ['/feed', '/notifications', '/itineraries/mine']

  for (const url of comCursor) {
    test(`${url} com cursor malformado devolve 400`, async () => {
      const res = await app.inject({
        method: 'GET', url: `${url}?cursor=lixo`, headers: comToken(ana.accessToken),
      })
      assert.equal(res.statusCode, 400)
    })
  }

  test('a mensagem não expõe SQL nem o tipo da coluna', async () => {
    const res = await app.inject({ method: 'GET', url: '/feed?cursor=lixo', headers: comToken(ana.accessToken) })

    assert.doesNotMatch(res.body, /uuid/i)
    assert.doesNotMatch(res.body, /SELECT|FROM|WHERE/i)
  })

  test('cursor válido continua a funcionar', async () => {
    const post = await criarPost(app, ana.accessToken, { caption: 'x' })
    const res = await app.inject({
      method: 'GET', url: `/feed?cursor=${post.id}`, headers: comToken(ana.accessToken),
    })
    assert.equal(res.statusCode, 200)
  })

  test('cursor ausente continua a funcionar', async () => {
    const res = await app.inject({ method: 'GET', url: '/feed', headers: comToken(ana.accessToken) })
    assert.equal(res.statusCode, 200)
  })

  test('/posts/nearby aceita cursor numérico — a excepção declarada', async () => {
    const res = await app.inject({ method: 'GET', url: '/posts/nearby?lat=38.7&lon=-9.1&cursor=12.5' })

    assert.notEqual(res.statusCode, 400, 'o cursor de distância não pode ser validado como UUID')
  })
})

describe('RISCO-001 — markup em texto do utilizador', () => {
  const MARCACAO = '<img src=x onerror=alert(1)>Lisboa'

  test('a bio é guardada sem markup', async () => {
    await app.inject({
      method: 'PATCH', url: '/users/me', headers: comToken(ana.accessToken),
      payload: { bio: MARCACAO },
    })

    const { rows } = await query('SELECT bio FROM users WHERE id = $1', [ana.user.id])
    assert.equal(rows[0].bio, 'Lisboa')
  })

  test('o nome a mostrar é guardado sem markup', async () => {
    await app.inject({
      method: 'PATCH', url: '/users/me', headers: comToken(ana.accessToken),
      payload: { displayName: '<b>Ana</b>' },
    })

    const { rows } = await query('SELECT display_name FROM users WHERE id = $1', [ana.user.id])
    assert.equal(rows[0].display_name, 'Ana')
  })

  test('a legenda do post é guardada sem markup', async () => {
    const post = await criarPost(app, ana.accessToken, { caption: MARCACAO })
    const { rows } = await query('SELECT caption FROM posts WHERE id = $1', [post.id])
    assert.equal(rows[0].caption, 'Lisboa')
  })

  test('o comentário é guardado sem markup', async () => {
    const post = await criarPost(app, ana.accessToken, { caption: 'x' })
    await app.inject({
      method: 'POST', url: `/posts/${post.id}/comments`, headers: comToken(bob.accessToken),
      payload: { content: '<script>alert(1)</script>Boa foto' },
    })

    const { rows } = await query('SELECT content FROM post_comments WHERE post_id = $1', [post.id])
    assert.equal(rows[0].content, 'alert(1)Boa foto')
  })

  test('o nome do grupo é guardado sem markup', async () => {
    const res = await app.inject({
      method: 'POST', url: '/groups', headers: comToken(ana.accessToken),
      payload: { name: '<i>Roma</i> 2026' },
    })
    const { id } = JSON.parse(res.body)

    const { rows } = await query('SELECT name FROM travel_groups WHERE id = $1', [id])
    assert.equal(rows[0].name, 'Roma 2026')
  })

  test('texto legítimo com sinais de menor sobrevive', async () => {
    // "5 < 10" não é markup e não pode ser mutilado.
    const post = await criarPost(app, ana.accessToken, { caption: 'Gastei 5 < 10 euros' })
    const { rows } = await query('SELECT caption FROM posts WHERE id = $1', [post.id])
    assert.equal(rows[0].caption, 'Gastei 5 < 10 euros')
  })

  test('acentos e emoji sobrevivem', async () => {
    const post = await criarPost(app, ana.accessToken, { caption: 'Açores à noite 🌙' })
    const { rows } = await query('SELECT caption FROM posts WHERE id = $1', [post.id])
    assert.equal(rows[0].caption, 'Açores à noite 🌙')
  })
})

describe('RISCO-003 — validação do alvo da denúncia', () => {
  test('denunciar conteúdo inexistente devolve 404', async () => {
    const res = await app.inject({
      method: 'POST', url: '/reports', headers: comToken(ana.accessToken),
      payload: { targetType: 'post', targetId: '00000000-0000-0000-0000-000000000000', reason: 'spam' },
    })

    assert.equal(res.statusCode, 404)
    const { rows } = await query('SELECT count(*)::int n FROM content_reports')
    assert.equal(rows[0].n, 0, 'não pode entrar na fila de moderação')
  })

  test('auto-denúncia é recusada', async () => {
    const res = await app.inject({
      method: 'POST', url: '/reports', headers: comToken(ana.accessToken),
      payload: { targetType: 'user', targetId: ana.user.id, reason: 'spam' },
    })

    assert.equal(res.statusCode, 400)
  })

  test('denúncia legítima de outro utilizador é aceite', async () => {
    const res = await app.inject({
      method: 'POST', url: '/reports', headers: comToken(ana.accessToken),
      payload: { targetType: 'user', targetId: bob.user.id, reason: 'spam' },
    })

    assert.ok(res.statusCode < 300, `esperado 2xx, veio ${res.statusCode}: ${res.body}`)
    const { rows } = await query('SELECT count(*)::int n FROM content_reports')
    assert.equal(rows[0].n, 1)
  })

  test('denúncia legítima de um post é aceite', async () => {
    const post = await criarPost(app, ana.accessToken, { caption: 'x' })

    const res = await app.inject({
      method: 'POST', url: '/reports', headers: comToken(bob.accessToken),
      payload: { targetType: 'post', targetId: post.id, reason: 'spam' },
    })

    assert.ok(res.statusCode < 300, `veio ${res.statusCode}: ${res.body}`)
  })
})

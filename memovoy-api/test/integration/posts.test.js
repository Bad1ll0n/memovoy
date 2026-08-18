import { test, describe, before, after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { query } from '../../src/db/pool.js'
import { criarApp, fecharApp, limparBaseDeDados, registarUtilizador, comToken, criarPost } from './helpers.js'

// O foco aqui é autorização: quem pode alterar e apagar o quê. Um erro nestas
// verificações deixa qualquer utilizador mexer no conteúdo dos outros, e não é
// o tipo de bug que aparece a usar a app normalmente.

let app
let autor      // dono do conteúdo
let intruso    // outro utilizador autenticado

before(async () => { app = await criarApp() })
after(async () => { await fecharApp(app) })

beforeEach(async () => {
  await limparBaseDeDados()
  autor   = await registarUtilizador(app)
  intruso = await registarUtilizador(app)
})

describe('POST /posts', () => {
  test('exige autenticação', async () => {
    const res = await app.inject({ method: 'POST', url: '/posts', payload: { caption: 'olá' } })
    assert.equal(res.statusCode, 401)
  })

  test('cria o post e atribui-o a quem o publicou', async () => {
    const post = await criarPost(app, autor.accessToken, { caption: 'Bom dia de Sintra.' })

    assert.equal(post.caption, 'Bom dia de Sintra.')

    const { rows } = await query('SELECT user_id FROM posts WHERE id = $1', [post.id])
    assert.equal(rows[0].user_id, autor.user.id)
  })

  test('rejeita imagens que não sejam URLs', async () => {
    const res = await app.inject({
      method: 'POST', url: '/posts',
      headers: comToken(autor.accessToken),
      payload: { caption: 'x', images: ['nao-e-url'] },
    })
    assert.equal(res.statusCode, 400)
  })

  test('rejeita mais de 10 imagens', async () => {
    const res = await app.inject({
      method: 'POST', url: '/posts',
      headers: comToken(autor.accessToken),
      payload: { images: Array.from({ length: 11 }, (_, i) => `https://exemplo.pt/${i}.jpg`) },
    })
    assert.equal(res.statusCode, 400)
  })

  test('rejeita coordenadas fora do intervalo', async () => {
    const res = await app.inject({
      method: 'POST', url: '/posts',
      headers: comToken(autor.accessToken),
      payload: { caption: 'x', lat: 200, lon: 0 },
    })
    assert.equal(res.statusCode, 400)
  })

  test('não deixa associar o post a roteiro de outra pessoa', async () => {
    const { rows } = await query(
      `INSERT INTO itineraries (user_id, title, destination, data)
       VALUES ($1, 'Roteiro do autor', 'Lisboa', '{}'::jsonb) RETURNING id`,
      [autor.user.id],
    )

    const res = await app.inject({
      method: 'POST', url: '/posts',
      headers: comToken(intruso.accessToken),
      payload: { caption: 'roubado', itineraryId: rows[0].id },
    })

    assert.equal(res.statusCode, 403)
  })

  test('não deixa publicar em grupo de que não se é membro', async () => {
    const { rows } = await query(
      `INSERT INTO travel_groups (name, owner_id) VALUES ('Grupo fechado', $1) RETURNING id`,
      [autor.user.id],
    )

    const res = await app.inject({
      method: 'POST', url: '/posts',
      headers: comToken(intruso.accessToken),
      payload: { caption: 'intruso', groupId: rows[0].id },
    })

    assert.equal(res.statusCode, 403)
  })
})

describe('PATCH /posts/:id', () => {
  test('o autor edita o próprio post', async () => {
    const post = await criarPost(app, autor.accessToken, { caption: 'antes' })

    const res = await app.inject({
      method: 'PATCH', url: `/posts/${post.id}`,
      headers: comToken(autor.accessToken),
      payload: { caption: 'depois' },
    })

    assert.equal(res.statusCode, 200)
    const { rows } = await query('SELECT caption FROM posts WHERE id = $1', [post.id])
    assert.equal(rows[0].caption, 'depois')
  })

  test('outro utilizador não edita — 403 e o conteúdo fica intacto', async () => {
    const post = await criarPost(app, autor.accessToken, { caption: 'original' })

    const res = await app.inject({
      method: 'PATCH', url: `/posts/${post.id}`,
      headers: comToken(intruso.accessToken),
      payload: { caption: 'adulterado' },
    })

    assert.equal(res.statusCode, 403)
    const { rows } = await query('SELECT caption FROM posts WHERE id = $1', [post.id])
    assert.equal(rows[0].caption, 'original')
  })

  test('post inexistente devolve 404', async () => {
    const res = await app.inject({
      method: 'PATCH', url: '/posts/00000000-0000-0000-0000-000000000000',
      headers: comToken(autor.accessToken),
      payload: { caption: 'x' },
    })
    assert.equal(res.statusCode, 404)
  })

  test('corpo sem campos conhecidos devolve 400', async () => {
    const post = await criarPost(app, autor.accessToken)

    const res = await app.inject({
      method: 'PATCH', url: `/posts/${post.id}`,
      headers: comToken(autor.accessToken),
      payload: {},
    })

    assert.equal(res.statusCode, 400)
  })
})

describe('DELETE /posts/:id', () => {
  test('o autor apaga o próprio post', async () => {
    const post = await criarPost(app, autor.accessToken)

    const res = await app.inject({
      method: 'DELETE', url: `/posts/${post.id}`,
      headers: comToken(autor.accessToken),
    })

    assert.equal(res.statusCode, 200)
    const { rows } = await query('SELECT 1 FROM posts WHERE id = $1', [post.id])
    assert.equal(rows.length, 0)
  })

  test('outro utilizador não apaga — 403 e o post sobrevive', async () => {
    const post = await criarPost(app, autor.accessToken)

    const res = await app.inject({
      method: 'DELETE', url: `/posts/${post.id}`,
      headers: comToken(intruso.accessToken),
    })

    assert.equal(res.statusCode, 403)
    const { rows } = await query('SELECT 1 FROM posts WHERE id = $1', [post.id])
    assert.equal(rows.length, 1, 'o post não devia ter desaparecido')
  })

  test('sem autenticação devolve 401', async () => {
    const post = await criarPost(app, autor.accessToken)
    const res = await app.inject({ method: 'DELETE', url: `/posts/${post.id}` })
    assert.equal(res.statusCode, 401)
  })
})

describe('gostos', () => {
  test('gostar e deixar de gostar', async () => {
    const post = await criarPost(app, autor.accessToken)

    await app.inject({ method: 'POST', url: `/posts/${post.id}/like`, headers: comToken(intruso.accessToken) })

    let { rows } = await query('SELECT count(*)::int AS n FROM post_likes WHERE post_id = $1', [post.id])
    assert.equal(rows[0].n, 1)

    await app.inject({ method: 'DELETE', url: `/posts/${post.id}/like`, headers: comToken(intruso.accessToken) })

    ;({ rows } = await query('SELECT count(*)::int AS n FROM post_likes WHERE post_id = $1', [post.id]))
    assert.equal(rows[0].n, 0)
  })

  test('gostar duas vezes não duplica', async () => {
    const post = await criarPost(app, autor.accessToken)

    await app.inject({ method: 'POST', url: `/posts/${post.id}/like`, headers: comToken(intruso.accessToken) })
    await app.inject({ method: 'POST', url: `/posts/${post.id}/like`, headers: comToken(intruso.accessToken) })

    const { rows } = await query('SELECT count(*)::int AS n FROM post_likes WHERE post_id = $1', [post.id])
    assert.equal(rows[0].n, 1)
  })

  test('gostar exige autenticação', async () => {
    const post = await criarPost(app, autor.accessToken)
    const res = await app.inject({ method: 'POST', url: `/posts/${post.id}/like` })
    assert.equal(res.statusCode, 401)
  })
})

describe('comentários', () => {
  async function comentar(accessToken, postId, content = 'Um comentário.') {
    const res = await app.inject({
      method: 'POST', url: `/posts/${postId}/comments`,
      headers: comToken(accessToken),
      payload: { content },
    })
    return res
  }

  test('qualquer autenticado pode comentar', async () => {
    const post = await criarPost(app, autor.accessToken)
    const res = await comentar(intruso.accessToken, post.id)
    assert.ok(res.statusCode < 300, `esperado 2xx, veio ${res.statusCode}: ${res.body}`)
  })

  test('comentário vazio é rejeitado', async () => {
    const post = await criarPost(app, autor.accessToken)
    const res = await comentar(intruso.accessToken, post.id, '')
    assert.equal(res.statusCode, 400)
  })

  test('quem comentou pode apagar o próprio comentário', async () => {
    const post = await criarPost(app, autor.accessToken)
    await comentar(intruso.accessToken, post.id)

    const { rows } = await query('SELECT id FROM post_comments WHERE post_id = $1', [post.id])

    const res = await app.inject({
      method: 'DELETE', url: `/posts/comments/${rows[0].id}`,
      headers: comToken(intruso.accessToken),
    })

    assert.equal(res.statusCode, 200)
  })

  test('terceiro não apaga comentário alheio', async () => {
    const post = await criarPost(app, autor.accessToken)
    await comentar(intruso.accessToken, post.id)

    const { rows } = await query('SELECT id FROM post_comments WHERE post_id = $1', [post.id])

    // O autor do post não é o autor do comentário.
    const res = await app.inject({
      method: 'DELETE', url: `/posts/comments/${rows[0].id}`,
      headers: comToken(autor.accessToken),
    })

    assert.equal(res.statusCode, 403)
    const restantes = await query('SELECT 1 FROM post_comments WHERE id = $1', [rows[0].id])
    assert.equal(restantes.rows.length, 1)
  })
})

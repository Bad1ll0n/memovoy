import { test, describe, before, after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { query } from '../../src/db/pool.js'
import { criarApp, fecharApp, limparBaseDeDados, registarUtilizador, comToken } from './helpers.js'

// O /feed tinha cobertura só indirecta, e a sua query foi reescrita: os
// LEFT JOIN a post_likes e post_comments com COUNT(DISTINCT) davam um produto
// cartesiano — uma publicação com 300 gostos e 40 comentários gerava 12 000
// linhas antes de o GROUP BY as colapsar, com o LIMIT a aplicar-se só depois.
//
// Passaram a subqueries escalares. O que pode partir numa troca destas são
// exactamente as contagens, e é isso que aqui se verifica.

let app
let ana, bob, carla

before(async () => { app = await criarApp() })
after(async () => { await fecharApp(app) })

beforeEach(async () => {
  await limparBaseDeDados()
  ana   = await registarUtilizador(app)
  bob   = await registarUtilizador(app)
  carla = await registarUtilizador(app)
})

async function publicar(quem, caption = 'olá') {
  const { rows } = await query(
    `INSERT INTO posts (user_id, caption, images) VALUES ($1, $2, '["/x.jpg"]'::jsonb) RETURNING id`,
    [quem.user.id, caption],
  )
  return rows[0].id
}

const gostar    = (postId, quem) => query('INSERT INTO post_likes (post_id, user_id) VALUES ($1, $2)', [postId, quem.user.id])
const comentar  = (postId, quem, texto) => query('INSERT INTO post_comments (post_id, user_id, content) VALUES ($1, $2, $3)', [postId, quem.user.id, texto])
const seguir    = (quem, alvo) => query('INSERT INTO follows (follower_id, following_id) VALUES ($1, $2)', [quem.user.id, alvo.user.id])

const lerFeed = async (quem) => JSON.parse((await app.inject({
  method: 'GET', url: '/feed', headers: comToken(quem.accessToken),
})).body)

describe('contagens', () => {
  test('gostos e comentários vêm com os números certos', async () => {
    const postId = await publicar(ana)
    await gostar(postId, bob)
    await gostar(postId, carla)
    await comentar(postId, bob, 'primeiro')
    await comentar(postId, carla, 'segundo')
    await comentar(postId, bob, 'terceiro')

    const { posts } = await lerFeed(ana)

    assert.equal(posts.length, 1)
    assert.equal(posts[0].likesCount, 2)
    assert.equal(posts[0].commentsCount, 3)
  })

  test('gostos e comentários não se multiplicam um pelo outro', async () => {
    // Este é o caso que o produto cartesiano estragava. Com JOIN e sem DISTINCT
    // dariam 3×4 = 12 de cada; era o DISTINCT que salvava o resultado, ao custo
    // de agrupar milhares de linhas.
    const postId = await publicar(ana)
    for (const quem of [ana, bob, carla]) await gostar(postId, quem)
    for (let i = 0; i < 4; i++) await comentar(postId, bob, `c${i}`)

    const { posts } = await lerFeed(ana)

    assert.equal(posts[0].likesCount, 3)
    assert.equal(posts[0].commentsCount, 4)
  })

  test('uma publicação sem gostos nem comentários conta zero', async () => {
    // Com LEFT JOIN + COUNT, um caso destes é onde os NULL costumam virar 1.
    await publicar(ana)

    const { posts } = await lerFeed(ana)

    assert.equal(posts[0].likesCount, 0)
    assert.equal(posts[0].commentsCount, 0)
  })

  test('cada publicação tem a sua contagem, não a do vizinho', async () => {
    const a = await publicar(ana, 'primeira')
    const b = await publicar(ana, 'segunda')
    await gostar(a, bob)
    await gostar(b, bob)
    await gostar(b, carla)

    const { posts } = await lerFeed(ana)
    const porTexto = Object.fromEntries(posts.map((p) => [p.caption, p.likesCount]))

    assert.equal(porTexto['primeira'], 1)
    assert.equal(porTexto['segunda'], 2)
  })
})

describe('quem aparece no feed', () => {
  test('as minhas publicações e as de quem sigo', async () => {
    await publicar(ana, 'minha')
    await publicar(bob, 'do bob')
    await publicar(carla, 'da carla')
    await seguir(ana, bob)

    const { posts } = await lerFeed(ana)
    const textos = posts.map((p) => p.caption)

    assert.ok(textos.includes('minha'))
    assert.ok(textos.includes('do bob'))
    assert.ok(!textos.includes('da carla'), 'a Ana não segue a Carla')
  })

  test('mais recentes primeiro', async () => {
    await publicar(ana, 'antiga')
    await new Promise((r) => setTimeout(r, 20))
    await publicar(ana, 'recente')

    const { posts } = await lerFeed(ana)

    assert.equal(posts[0].caption, 'recente')
  })
})

describe('o que o utilizador já fez', () => {
  test('viewerLiked distingue quem gostou de quem não gostou', async () => {
    const postId = await publicar(ana)
    await gostar(postId, ana)
    await seguir(bob, ana)

    const daAna = await lerFeed(ana)
    const doBob = await lerFeed(bob)

    assert.equal(daAna.posts[0].viewerLiked, true)
    assert.equal(doBob.posts.find((p) => p.id === postId).viewerLiked, false)
  })

  test('isFollowing reflecte a relação', async () => {
    await publicar(bob)
    await seguir(ana, bob)

    const { posts } = await lerFeed(ana)

    assert.equal(posts[0].isFollowing, true)
  })
})

describe('feed vazio', () => {
  test('sem nada para mostrar, vem conteúdo curado', async () => {
    // Caminho alternativo da rota, que corre uma segunda query — também ela
    // reescrita, e por isso também testada.
    const postId = await publicar(bob, 'popular')
    await gostar(postId, carla)

    const { posts, isCurated } = await lerFeed(ana)

    assert.equal(isCurated, true)
    assert.equal(posts.length, 1)
    assert.equal(posts[0].caption, 'popular')
    assert.equal(posts[0].likesCount, 1)
  })

  test('o conteúdo curado não inclui as minhas próprias publicações', async () => {
    await publicar(bob, 'do bob')

    const { posts } = await lerFeed(ana)

    assert.ok(posts.every((p) => p.userId !== ana.user.id))
  })
})

describe('paginação', () => {
  test('o cursor traz a página seguinte sem repetir', async () => {
    for (let i = 0; i < 14; i++) {
      await publicar(ana, `post ${i}`)
      await new Promise((r) => setTimeout(r, 3))
    }

    const primeira = await lerFeed(ana)
    assert.equal(primeira.posts.length, 10)
    assert.ok(primeira.nextCursor)

    const segunda = JSON.parse((await app.inject({
      method: 'GET', url: `/feed?cursor=${primeira.nextCursor}`,
      headers: comToken(ana.accessToken),
    })).body)

    const ids = new Set(primeira.posts.map((p) => p.id))
    assert.ok(segunda.posts.every((p) => !ids.has(p.id)), 'a segunda página não pode repetir a primeira')
  })
})

import { test, describe, before, after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { query } from '../../src/db/pool.js'
import { criarApp, fecharApp, limparBaseDeDados, registarUtilizador, comToken, criarPost } from './helpers.js'

// Sem isto, "conta privada" era um cadeado com a chave colada ao lado.
//
// O POST /users/:id/follow inseria logo em follows, mesmo numa conta privada.
// Qualquer pessoa carregava em Seguir e passava a ver tudo — as publicações, os
// check-ins, o mapa de países. A verificação de privacidade estava certa; o que
// faltava era que "seguidor" quisesse dizer alguma coisa.

let app
let fechada    // conta privada
let curioso    // quer seguir
let terceiro   // não tem nada a ver com isto

const SEGREDO = 'so-para-seguidores-aceites'

before(async () => { app = await criarApp() })
after(async () => { await fecharApp(app) })

beforeEach(async () => {
  await limparBaseDeDados()
  fechada  = await registarUtilizador(app)
  curioso  = await registarUtilizador(app)
  terceiro = await registarUtilizador(app)

  await criarPost(app, fechada.accessToken, {
    caption: SEGREDO, images: ['https://exemplo.pt/a.jpg'],
  })
  await app.inject({
    method: 'PATCH', url: '/users/me',
    headers: comToken(fechada.accessToken),
    payload: { isPrivate: true },
  })
})

const seguir = (token, id) =>
  app.inject({ method: 'POST', url: `/users/${id}/follow`, headers: comToken(token) })

const fila = async (token) => {
  const res = await app.inject({
    method: 'GET', url: '/users/me/follow-requests', headers: comToken(token),
  })
  assert.equal(res.statusCode, 200)
  return JSON.parse(res.body).requests
}

const veConteudoDe = async (token, id) => {
  const res = await app.inject({
    method: 'GET', url: `/users/${id}/posts`, headers: comToken(token),
  })
  return res.statusCode === 200 && res.body.includes(SEGREDO)
}

describe('pedir para seguir', () => {
  test('numa conta privada não dá acesso imediato', async () => {
    const res = await seguir(curioso.accessToken, fechada.user.id)

    assert.equal(res.statusCode, 202, 'devia ser um pedido, não um seguimento')
    assert.equal(JSON.parse(res.body).status, 'requested')
    assert.equal(await veConteudoDe(curioso.accessToken, fechada.user.id), false,
      'pedir não pode dar acesso — era exactamente o defeito')

    // E não aparece como seguidor de ninguém enquanto estiver pendente.
    const { rows } = await query(
      'SELECT 1 FROM follows WHERE follower_id = $1 AND following_id = $2',
      [curioso.user.id, fechada.user.id],
    )
    assert.equal(rows.length, 0, 'um pedido pendente não é uma linha em follows')
  })

  test('numa conta pública continua a ser imediato', async () => {
    // A parte que é fácil partir ao acrescentar a fila.
    const res = await seguir(curioso.accessToken, terceiro.user.id)
    assert.equal(res.statusCode, 201)
    assert.equal(JSON.parse(res.body).status, 'following')
  })

  test('o perfil distingue "pedi" de "sigo"', async () => {
    await seguir(curioso.accessToken, fechada.user.id)

    const res = await app.inject({
      method: 'GET', url: `/users/${fechada.user.id}`, headers: comToken(curioso.accessToken),
    })
    const perfil = JSON.parse(res.body)
    assert.equal(perfil.viewerRequested, true)
    assert.equal(perfil.viewerFollows,   false, 'pedir não é seguir')
  })

  test('pedir duas vezes não cria dois pedidos', async () => {
    await seguir(curioso.accessToken, fechada.user.id)
    await seguir(curioso.accessToken, fechada.user.id)
    assert.equal((await fila(fechada.accessToken)).length, 1)
  })

  test('quem já seguia antes da conta fechar não é despromovido a pendente', async () => {
    const aberta = await registarUtilizador(app)
    await seguir(curioso.accessToken, aberta.user.id)

    await app.inject({
      method: 'PATCH', url: '/users/me',
      headers: comToken(aberta.accessToken), payload: { isPrivate: true },
    })

    // Segundo toque no botão não pode transformar um seguidor em pedinte.
    const res = await seguir(curioso.accessToken, aberta.user.id)
    assert.equal(res.statusCode, 201)
    assert.equal((await fila(aberta.accessToken)).length, 0)
  })
})

describe('responder ao pedido', () => {
  beforeEach(async () => { await seguir(curioso.accessToken, fechada.user.id) })

  test('a fila mostra quem pediu', async () => {
    const pedidos = await fila(fechada.accessToken)
    assert.equal(pedidos.length, 1)
    assert.equal(pedidos[0].userId, curioso.user.id)
    assert.equal(pedidos[0].username, curioso.dados.username)
  })

  test('aceitar dá acesso, esvazia a fila e avisa quem pediu', async () => {
    const res = await app.inject({
      method: 'POST', url: `/users/me/follow-requests/${curioso.user.id}`,
      headers: comToken(fechada.accessToken),
    })
    assert.equal(res.statusCode, 200)

    assert.equal(await veConteudoDe(curioso.accessToken, fechada.user.id), true)
    assert.equal((await fila(fechada.accessToken)).length, 0)

    const avisos = await app.inject({
      method: 'GET', url: '/notifications', headers: comToken(curioso.accessToken),
    })
    assert.ok(JSON.parse(avisos.body).notifications.some((n) => n.type === 'follow_accepted'),
      'quem pediu tem de saber que foi aceite')
  })

  test('recusar não dá acesso, e não avisa ninguém', async () => {
    const res = await app.inject({
      method: 'DELETE', url: `/users/me/follow-requests/${curioso.user.id}`,
      headers: comToken(fechada.accessToken),
    })
    assert.equal(res.statusCode, 200)

    assert.equal(await veConteudoDe(curioso.accessToken, fechada.user.id), false)
    assert.equal((await fila(fechada.accessToken)).length, 0)

    // Dizer a alguém que foi recusado não lhe serve para nada e convida a
    // insistir. A ausência de aviso é a decisão, não um esquecimento.
    const avisos = await app.inject({
      method: 'GET', url: '/notifications', headers: comToken(curioso.accessToken),
    })
    assert.equal(JSON.parse(avisos.body).notifications.length, 0)
  })

  test('aceitar duas vezes responde 404 à segunda', async () => {
    const url = `/users/me/follow-requests/${curioso.user.id}`
    const primeira = await app.inject({ method: 'POST', url, headers: comToken(fechada.accessToken) })
    const segunda  = await app.inject({ method: 'POST', url, headers: comToken(fechada.accessToken) })

    assert.equal(primeira.statusCode, 200)
    assert.equal(segunda.statusCode, 404, 'dois toques no botão não podem aceitar duas vezes')
  })

  test('ninguém responde a um pedido que não lhe foi dirigido', async () => {
    const res = await app.inject({
      method: 'POST', url: `/users/me/follow-requests/${curioso.user.id}`,
      headers: comToken(terceiro.accessToken),
    })
    assert.equal(res.statusCode, 404)
    assert.equal((await fila(fechada.accessToken)).length, 1, 'o pedido continua na fila do dono')
  })

  test('quem pediu pode retirar o pedido pelo mesmo botão', async () => {
    const res = await app.inject({
      method: 'DELETE', url: `/users/${fechada.user.id}/follow`,
      headers: comToken(curioso.accessToken),
    })
    assert.equal(res.statusCode, 200)
    assert.equal((await fila(fechada.accessToken)).length, 0)
  })
})

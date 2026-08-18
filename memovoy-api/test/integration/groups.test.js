import { test, describe, before, after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { query } from '../../src/db/pool.js'
import { criarApp, fecharApp, limparBaseDeDados, registarUtilizador, comToken } from './helpers.js'

// Grupos concentram muita autorização: dono contra membro contra estranho, e
// grupos privados que só se entram por convite. É onde é mais fácil deixar
// passar uma verificação.

let app
let dono, membro, estranho

before(async () => { app = await criarApp() })
after(async () => { await fecharApp(app) })

beforeEach(async () => {
  await limparBaseDeDados()
  dono     = await registarUtilizador(app)
  membro   = await registarUtilizador(app)
  estranho = await registarUtilizador(app)
})

async function criarGrupo(quem, corpo = { name: 'Viagem a Roma' }) {
  const res = await app.inject({
    method: 'POST', url: '/groups',
    headers: comToken(quem.accessToken),
    payload: corpo,
  })
  if (res.statusCode >= 300) throw new Error(`criar grupo falhou (${res.statusCode}): ${res.body}`)
  return JSON.parse(res.body).id
}

async function entrar(quem, groupId) {
  return app.inject({ method: 'POST', url: `/groups/${groupId}/join`, headers: comToken(quem.accessToken) })
}

describe('POST /groups', () => {
  test('exige autenticação', async () => {
    const res = await app.inject({ method: 'POST', url: '/groups', payload: { name: 'Grupo' } })
    assert.equal(res.statusCode, 401)
  })

  test('cria o grupo e inscreve o dono automaticamente', async () => {
    const id = await criarGrupo(dono)

    const { rows } = await query('SELECT owner_id FROM travel_groups WHERE id = $1', [id])
    assert.equal(rows[0].owner_id, dono.user.id)

    const membros = await query('SELECT user_id FROM group_members WHERE group_id = $1', [id])
    assert.equal(membros.rows.length, 1)
    assert.equal(membros.rows[0].user_id, dono.user.id)
  })

  test('rejeita nome com menos de 2 caracteres', async () => {
    const res = await app.inject({
      method: 'POST', url: '/groups',
      headers: comToken(dono.accessToken),
      payload: { name: 'x' },
    })
    assert.equal(res.statusCode, 400)
  })
})

describe('entrar no grupo', () => {
  test('qualquer autenticado entra num grupo público', async () => {
    const id = await criarGrupo(dono)

    const res = await entrar(membro, id)
    assert.equal(res.statusCode, 201)

    const { rows } = await query('SELECT count(*)::int AS n FROM group_members WHERE group_id = $1', [id])
    assert.equal(rows[0].n, 2)
  })

  test('grupo privado recusa entrada directa — precisa de convite', async () => {
    const id = await criarGrupo(dono, { name: 'Grupo fechado', isPrivate: true })

    const res = await entrar(membro, id)
    assert.equal(res.statusCode, 403)

    const { rows } = await query('SELECT count(*)::int AS n FROM group_members WHERE group_id = $1', [id])
    assert.equal(rows[0].n, 1, 'só o dono devia estar lá dentro')
  })

  test('entrar duas vezes não duplica a inscrição', async () => {
    const id = await criarGrupo(dono)

    await entrar(membro, id)
    await entrar(membro, id)

    const { rows } = await query(
      'SELECT count(*)::int AS n FROM group_members WHERE group_id = $1 AND user_id = $2',
      [id, membro.user.id],
    )
    assert.equal(rows[0].n, 1)
  })

  test('grupo inexistente devolve 404', async () => {
    const res = await app.inject({
      method: 'POST', url: '/groups/00000000-0000-0000-0000-000000000000/join',
      headers: comToken(membro.accessToken),
    })
    assert.equal(res.statusCode, 404)
  })
})

describe('PATCH /groups/:id', () => {
  test('o dono edita', async () => {
    const id = await criarGrupo(dono)

    const res = await app.inject({
      method: 'PATCH', url: `/groups/${id}`,
      headers: comToken(dono.accessToken),
      payload: { name: 'Nome novo' },
    })

    assert.equal(res.statusCode, 200)
    const { rows } = await query('SELECT name FROM travel_groups WHERE id = $1', [id])
    assert.equal(rows[0].name, 'Nome novo')
  })

  test('um membro que não é dono não edita', async () => {
    const id = await criarGrupo(dono)
    await entrar(membro, id)

    const res = await app.inject({
      method: 'PATCH', url: `/groups/${id}`,
      headers: comToken(membro.accessToken),
      payload: { name: 'Assaltado' },
    })

    assert.equal(res.statusCode, 403)
    const { rows } = await query('SELECT name FROM travel_groups WHERE id = $1', [id])
    assert.equal(rows[0].name, 'Viagem a Roma')
  })

  test('um estranho também não', async () => {
    const id = await criarGrupo(dono)

    const res = await app.inject({
      method: 'PATCH', url: `/groups/${id}`,
      headers: comToken(estranho.accessToken),
      payload: { name: 'Assaltado' },
    })

    assert.equal(res.statusCode, 403)
  })
})

describe('sair do grupo', () => {
  test('um membro sai', async () => {
    const id = await criarGrupo(dono)
    await entrar(membro, id)

    const res = await app.inject({
      method: 'DELETE', url: `/groups/${id}/leave`,
      headers: comToken(membro.accessToken),
    })

    assert.equal(res.statusCode, 200)
    const { rows } = await query(
      'SELECT count(*)::int AS n FROM group_members WHERE group_id = $1 AND user_id = $2',
      [id, membro.user.id],
    )
    assert.equal(rows[0].n, 0)
  })

  test('o dono não pode sair — deixaria o grupo sem dono', async () => {
    const id = await criarGrupo(dono)

    const res = await app.inject({
      method: 'DELETE', url: `/groups/${id}/leave`,
      headers: comToken(dono.accessToken),
    })

    assert.equal(res.statusCode, 400)
    const { rows } = await query(
      'SELECT count(*)::int AS n FROM group_members WHERE group_id = $1 AND user_id = $2',
      [id, dono.user.id],
    )
    assert.equal(rows[0].n, 1)
  })
})

describe('transferir propriedade', () => {
  test('o dono transfere para um membro', async () => {
    const id = await criarGrupo(dono)
    await entrar(membro, id)

    const res = await app.inject({
      method: 'PATCH', url: `/groups/${id}/transfer`,
      headers: comToken(dono.accessToken),
      payload: { userId: membro.user.id },
    })

    assert.equal(res.statusCode, 200)
    const { rows } = await query('SELECT owner_id FROM travel_groups WHERE id = $1', [id])
    assert.equal(rows[0].owner_id, membro.user.id)
  })

  test('não se transfere para quem não é membro', async () => {
    const id = await criarGrupo(dono)

    const res = await app.inject({
      method: 'PATCH', url: `/groups/${id}/transfer`,
      headers: comToken(dono.accessToken),
      payload: { userId: estranho.user.id },
    })

    assert.equal(res.statusCode, 400)
    const { rows } = await query('SELECT owner_id FROM travel_groups WHERE id = $1', [id])
    assert.equal(rows[0].owner_id, dono.user.id)
  })

  test('um membro não transfere a propriedade para si próprio', async () => {
    const id = await criarGrupo(dono)
    await entrar(membro, id)

    const res = await app.inject({
      method: 'PATCH', url: `/groups/${id}/transfer`,
      headers: comToken(membro.accessToken),
      payload: { userId: membro.user.id },
    })

    assert.equal(res.statusCode, 403)
    const { rows } = await query('SELECT owner_id FROM travel_groups WHERE id = $1', [id])
    assert.equal(rows[0].owner_id, dono.user.id)
  })
})

describe('DELETE /groups/:id', () => {
  test('o dono elimina', async () => {
    const id = await criarGrupo(dono)

    const res = await app.inject({
      method: 'DELETE', url: `/groups/${id}`,
      headers: comToken(dono.accessToken),
    })

    assert.equal(res.statusCode, 200)
    const { rows } = await query('SELECT 1 FROM travel_groups WHERE id = $1', [id])
    assert.equal(rows.length, 0)
  })

  test('um membro não elimina o grupo', async () => {
    const id = await criarGrupo(dono)
    await entrar(membro, id)

    const res = await app.inject({
      method: 'DELETE', url: `/groups/${id}`,
      headers: comToken(membro.accessToken),
    })

    assert.equal(res.statusCode, 403)
    const { rows } = await query('SELECT 1 FROM travel_groups WHERE id = $1', [id])
    assert.equal(rows.length, 1, 'o grupo não devia ter desaparecido')
  })

  test('eliminar o grupo arrasta as inscrições', async () => {
    const id = await criarGrupo(dono)
    await entrar(membro, id)

    await app.inject({ method: 'DELETE', url: `/groups/${id}`, headers: comToken(dono.accessToken) })

    const { rows } = await query('SELECT count(*)::int AS n FROM group_members WHERE group_id = $1', [id])
    assert.equal(rows[0].n, 0)
  })
})

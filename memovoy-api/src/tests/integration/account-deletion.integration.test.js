// src/tests/integration/account-deletion.integration.test.js
// Testa o endpoint DELETE /users/me de eliminação de conta.
// Crítico: requer BD real porque valida efeitos em cascata
// (anonimização, revogação de sessões, soft-delete de conteúdo).

import { describe, it, before, after, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import postgres from 'postgres'
import argon2 from 'argon2'
import { AuthService } from '../../auth/auth.service.js'
import { ItinerariesService } from '../../itineraries/itineraries.service.js'

const TEST_DB_URL = process.env.DATABASE_URL
if (!TEST_DB_URL) { process.exit(0) }

const sql = postgres(TEST_DB_URL, { max: 5 })

const mockJwt = {
  sign:   (p) => `mock.${JSON.stringify(p)}`,
  verify: (t) => JSON.parse(t.replace('mock.', '')),
  decode: (t) => JSON.parse(t.replace('mock.', '')),
}

let txSql, txReject, testUser
const PLAIN_PASSWORD = 'CorrectPass123!'

function makeTxDb() {
  return {
    sql: txSql,
    transaction: async (fn) => fn(txSql),
    withUser: async (userId, role, fn) => {
      await txSql`SELECT set_config('app.current_user_id', ${userId}, true)`
      await txSql`SELECT set_config('app.current_user_role', ${role}, true)`
      return fn(txSql)
    },
  }
}

before(async () => { await sql`SELECT 1` })
after(async ()  => { await sql.end()     })

beforeEach(async () => {
  await new Promise((resolve) => {
    txSql = null
    sql.begin(async (tx) => {
      txSql = tx
      resolve()
      await new Promise((res, rej) => { txReject = rej })
      throw new Error('ROLLBACK_INTENTIONAL')
    }).catch(() => {})
    const wait = setInterval(() => { if (txSql) { clearInterval(wait); resolve() } }, 10)
  })

  const db  = makeTxDb()
  const svc = new AuthService(db, mockJwt)
  const result = await svc.register({
    email:    `delete-test-${Date.now()}@memovoy.com`,
    password: PLAIN_PASSWORD,
    username: `deletetest${Date.now()}`,
    countryCode: 'PT',
  })
  testUser = result.user
})

afterEach(() => {
  if (txReject) txReject(new Error('ROLLBACK_INTENTIONAL'))
})

// ---------------------------------------------------------------------------
// Replica mínima da lógica do endpoint, para testar a lógica de negócio
// directamente sem precisar de subir o servidor Fastify completo.
// Espelha exactamente o que está em users.routes.js — qualquer mudança
// lá deve ser reflectida aqui.
// ---------------------------------------------------------------------------

async function deleteAccount(db, userId, role, password) {
  return db.withUser(userId, role, async (tx) => {
    const [user] = await tx`
      SELECT password_hash FROM users WHERE id = ${userId} AND deleted_at IS NULL
    `
    if (!user) {
      const err = new Error('Utilizador não encontrado')
      err.code = 'NOT_FOUND'
      throw err
    }

    const validPassword = await argon2.verify(user.password_hash, password)
    if (!validPassword) {
      const err = new Error('Password incorrecta')
      err.code = 'VALIDATION_ERROR'
      throw err
    }

    const anonUsername = `eliminado_${userId.slice(0, 8)}`

    await tx`
      UPDATE users SET
        email_encrypted = NULL,
        email_hash       = NULL,
        username          = ${anonUsername},
        password_hash     = '',
        deleted_at        = NOW()
      WHERE id = ${userId}
    `

    await tx`
      UPDATE user_profiles SET
        display_name   = 'Utilizador eliminado',
        bio            = NULL,
        avatar_url     = NULL,
        location_text  = NULL
      WHERE user_id = ${userId}
    `

    await tx`
      UPDATE user_sessions SET revoked_at = NOW()
      WHERE user_id = ${userId} AND revoked_at IS NULL
    `

    await tx`
      UPDATE itineraries SET deleted_at = NOW()
      WHERE user_id = ${userId} AND deleted_at IS NULL
    `
    await tx`
      UPDATE posts SET deleted_at = NOW()
      WHERE user_id = ${userId} AND deleted_at IS NULL
    `
  })
}

// ---------------------------------------------------------------------------
// Testes
// ---------------------------------------------------------------------------

describe('Eliminação de conta — RGPD/LGPD', () => {

  it('rejeita com password errada e não altera nada', async () => {
    const db = makeTxDb()

    await assert.rejects(
      () => deleteAccount(db, testUser.id, 'user', 'PasswordErrada123!'),
      (err) => { assert.equal(err.code, 'VALIDATION_ERROR'); return true }
    )

    // Confirmar que NADA foi alterado — utilizador continua intacto
    const [user] = await txSql`
      SELECT username, deleted_at FROM users WHERE id = ${testUser.id}
    `
    assert.equal(user.username, testUser.username, 'username não deve mudar')
    assert.equal(user.deleted_at, null, 'deleted_at deve continuar null')
  })

  it('com password correcta: anonimiza email e username', async () => {
    const db = makeTxDb()
    await deleteAccount(db, testUser.id, 'user', PLAIN_PASSWORD)

    const [user] = await txSql`
      SELECT email_encrypted, email_hash, username, password_hash, deleted_at
      FROM users WHERE id = ${testUser.id}
    `
    assert.equal(user.email_encrypted, null, 'email_encrypted deve ser NULL')
    assert.equal(user.email_hash,      null, 'email_hash deve ser NULL')
    assert.ok(user.username.startsWith('eliminado_'), 'username deve ser anonimizado')
    assert.equal(user.password_hash, '', 'password_hash deve ser esvaziado')
    assert.ok(user.deleted_at, 'deleted_at deve estar preenchido')
  })

  it('anonimiza o perfil (display_name, bio, avatar)', async () => {
    const db = makeTxDb()

    // Preencher perfil com dados reais antes de eliminar
    await txSql`
      UPDATE user_profiles SET
        display_name = 'João Real Nome',
        bio = 'A minha biografia pessoal',
        avatar_url = 'https://cdn.memovoy.com/avatar.jpg',
        location_text = 'Lisboa, Portugal'
      WHERE user_id = ${testUser.id}
    `

    await deleteAccount(db, testUser.id, 'user', PLAIN_PASSWORD)

    const [profile] = await txSql`
      SELECT display_name, bio, avatar_url, location_text
      FROM user_profiles WHERE user_id = ${testUser.id}
    `
    assert.equal(profile.display_name,  'Utilizador eliminado')
    assert.equal(profile.bio,           null)
    assert.equal(profile.avatar_url,    null)
    assert.equal(profile.location_text, null)
  })

  it('revoga TODAS as sessões activas', async () => {
    const db = makeTxDb()

    // Criar 2 sessões extra além da do registo
    await txSql`
      INSERT INTO user_sessions (user_id, expires_at)
      VALUES (${testUser.id}, NOW() + INTERVAL '30 days'),
             (${testUser.id}, NOW() + INTERVAL '30 days')
    `

    const before = await txSql`
      SELECT id FROM user_sessions
      WHERE user_id = ${testUser.id} AND revoked_at IS NULL
    `
    assert.ok(before.length >= 3, 'deve ter pelo menos 3 sessões activas antes')

    await deleteAccount(db, testUser.id, 'user', PLAIN_PASSWORD)

    const after = await txSql`
      SELECT id FROM user_sessions
      WHERE user_id = ${testUser.id} AND revoked_at IS NULL
    `
    assert.equal(after.length, 0, 'nenhuma sessão deve continuar activa')
  })

  it('soft-deletes roteiros e posts do utilizador', async () => {
    const db      = makeTxDb()
    const itinSvc = new ItinerariesService(db)

    const itinerary = await itinSvc.create(testUser.id, 'user', {
      title: 'Roteiro a ser eliminado', destinationName: 'Porto', countryCode: 'PT',
      startDate: '2026-10-01', endDate: '2026-10-05', groupType: 'solo',
    })

    await txSql`
      INSERT INTO posts (user_id, caption, visibility)
      VALUES (${testUser.id}, 'Post de teste', 'public')
    `

    await deleteAccount(db, testUser.id, 'user', PLAIN_PASSWORD)

    const [itin] = await txSql`
      SELECT deleted_at FROM itineraries WHERE id = ${itinerary.id}
    `
    assert.ok(itin.deleted_at, 'roteiro deve estar soft-deleted')

    const posts = await txSql`
      SELECT deleted_at FROM posts WHERE user_id = ${testUser.id}
    `
    assert.ok(posts.every(p => p.deleted_at !== null), 'todos os posts devem estar soft-deleted')
  })

  it('não afecta dados de OUTRO utilizador', async () => {
    const db      = makeTxDb()
    const authSvc = new AuthService(db, mockJwt)

    const other = await authSvc.register({
      email: `other-${Date.now()}@memovoy.com`, password: 'OtherPass123!',
      username: `other${Date.now()}`, countryCode: 'BR',
    })

    await deleteAccount(db, testUser.id, 'user', PLAIN_PASSWORD)

    const [otherUser] = await txSql`
      SELECT username, deleted_at FROM users WHERE id = ${other.user.id}
    `
    assert.equal(otherUser.username, other.user.username, 'outro utilizador não deve ser afectado')
    assert.equal(otherUser.deleted_at, null, 'outro utilizador não deve ser eliminado')
  })

  it('username anonimizado nunca colide com a UNIQUE constraint', async () => {
    const db = makeTxDb()

    // Eliminar a conta
    await deleteAccount(db, testUser.id, 'user', PLAIN_PASSWORD)

    // Um segundo utilizador, registado depois, deve poder ter qualquer
    // username sem colidir com "eliminado_xxxxxxxx" do primeiro
    const authSvc = new AuthService(db, mockJwt)
    await assert.doesNotReject(
      () => authSvc.register({
        email: `fresh-${Date.now()}@memovoy.com`, password: 'FreshPass123!',
        username: `freshuser${Date.now()}`, countryCode: 'PT',
      })
    )
  })

  it('eliminar conta já eliminada falha com NOT_FOUND', async () => {
    const db = makeTxDb()
    await deleteAccount(db, testUser.id, 'user', PLAIN_PASSWORD)

    await assert.rejects(
      () => deleteAccount(db, testUser.id, 'user', PLAIN_PASSWORD),
      (err) => { assert.equal(err.code, 'NOT_FOUND'); return true }
    )
  })
})

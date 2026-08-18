import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import Fastify from 'fastify'
import fastifyJwt from '@fastify/jwt'
import bcrypt from 'bcrypt'
import { hashPassword, verifyPassword } from '../../src/routes/auth.js'

// Estes testes guardam a subida de @fastify/jwt 9→10 e bcrypt 5→6, feitas
// para fechar advisories críticas. Se um major futuro partir o contrato,
// falham aqui em vez de em produção.

describe('hashing de passwords', () => {
  test('hashPassword produz argon2id, não bcrypt', async () => {
    const hash = await hashPassword('cavalo-bateria-agrafo')
    assert.ok(hash.startsWith('$argon2id$'), `esperado argon2id, veio: ${hash.slice(0, 12)}`)
  })

  test('hashes diferentes para a mesma password (salt aleatório)', async () => {
    const [a, b] = await Promise.all([hashPassword('mesma'), hashPassword('mesma')])
    assert.notEqual(a, b)
  })

  test('aceita a password correta contra hash argon2id', async () => {
    const hash = await hashPassword('correcta-123')
    const { valid, needsRehash } = await verifyPassword('correcta-123', hash)
    assert.equal(valid, true)
    assert.equal(needsRehash, false, 'hash acabado de criar não devia pedir rehash')
  })

  test('rejeita password errada contra hash argon2id', async () => {
    const hash = await hashPassword('correcta-123')
    const { valid } = await verifyPassword('errada-456', hash)
    assert.equal(valid, false)
  })
})

describe('compatibilidade com hashes bcrypt antigos', () => {
  // Contas criadas antes da migração para argon2id têm hashes $2b$.
  // Se o bcrypt 6 partisse isto, essas pessoas perdiam o acesso à conta.
  test('aceita hash bcrypt legado e marca para migração', async () => {
    const legado = bcrypt.hashSync('password-antiga', 12)
    assert.ok(legado.startsWith('$2b$'))

    const { valid, needsRehash } = await verifyPassword('password-antiga', legado)
    assert.equal(valid, true)
    assert.equal(needsRehash, true, 'login bcrypt bem-sucedido tem de migrar para argon2id')
  })

  test('rejeita password errada contra hash bcrypt legado', async () => {
    const legado = bcrypt.hashSync('password-antiga', 12)
    const { valid, needsRehash } = await verifyPassword('outra', legado)
    assert.equal(valid, false)
    assert.equal(needsRehash, false)
  })

  test('bcrypt.hashSync continua a funcionar — sustenta o DUMMY_HASH', async () => {
    // DUMMY_HASH é calculado no arranque para igualar o tempo de resposta
    // entre "email inexistente" e "password errada".
    const h = bcrypt.hashSync('__never_used__', 12)
    assert.ok(h.startsWith('$2b$'))
    assert.equal(await bcrypt.compare('__never_used__', h), true)
  })
})

describe('@fastify/jwt — configuração usada em server.js', () => {
  /** Instância com exactamente as opções de server.js. */
  async function comJwt(secret = 'segredo-de-teste-com-mais-de-32-caracteres') {
    const app = Fastify()
    await app.register(fastifyJwt, {
      secret,
      sign:   { algorithm: 'HS256' },
      verify: { algorithms: ['HS256'] },
    })
    return app
  }

  test('assina e verifica ida e volta', async () => {
    const app = await comJwt()
    const token = app.jwt.sign({ id: 'u1', username: 'ana' })
    const payload = app.jwt.verify(token)

    assert.equal(payload.id, 'u1')
    assert.equal(payload.username, 'ana')
    await app.close()
  })

  test('assina com HS256, não com outro algoritmo', async () => {
    const app = await comJwt()
    const token = app.jwt.sign({ id: 'u1' })
    const header = JSON.parse(Buffer.from(token.split('.')[0], 'base64url').toString())

    assert.equal(header.alg, 'HS256')
    await app.close()
  })

  test('rejeita token assinado com outro segredo', async () => {
    const emissor = await comJwt('segredo-do-atacante-com-32-caracteres-ok')
    const validador = await comJwt()
    const token = emissor.jwt.sign({ id: 'invasor' })

    assert.throws(() => validador.jwt.verify(token))
    await emissor.close()
    await validador.close()
  })

  test('rejeita token com alg none — confusão de algoritmo', async () => {
    const app = await comJwt()
    const header  = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url')
    const payload = Buffer.from(JSON.stringify({ id: 'invasor' })).toString('base64url')

    assert.throws(() => app.jwt.verify(`${header}.${payload}.`))
    await app.close()
  })

  test('rejeita token adulterado', async () => {
    const app = await comJwt()
    const token = app.jwt.sign({ id: 'u1' })
    const [h, , s] = token.split('.')
    const falso = Buffer.from(JSON.stringify({ id: 'admin' })).toString('base64url')

    assert.throws(() => app.jwt.verify(`${h}.${falso}.${s}`))
    await app.close()
  })
})

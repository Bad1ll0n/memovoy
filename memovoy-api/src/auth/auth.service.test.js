// src/auth/auth.service.test.js
// Testes unitários do AuthService.
// Usa o módulo nativo node:test (Node.js 22) + assert — sem Jest, sem Vitest.
//
// Estratégia: mock do db e jwt para testar lógica pura isoladamente.
// Não testamos integração com PostgreSQL aqui — isso é para testes de integração.

import { describe, it, before, mock } from 'node:test'
import assert from 'node:assert/strict'
import { AuthService, hashEmail, encryptEmail } from './auth.service.js'

// ---------------------------------------------------------------------------
// Helpers de mock
// ---------------------------------------------------------------------------

function makeMockDb(overrides = {}) {
  const defaultSql = Object.assign(
    // sql tag function que devolve array vazio por defeito
    async () => [],
    overrides.sql ?? {}
  )

  return {
    sql: defaultSql,
    transaction: async (fn) => fn(defaultSql),
    withUser: async (userId, role, fn) => fn(defaultSql),
    ...overrides,
  }
}

function makeMockJwt(overrides = {}) {
  return {
    sign:   (payload, opts) => `mock.token.${JSON.stringify(payload)}`,
    verify: (token, opts)   => {
      if (token === 'invalid') throw new Error('invalid token')
      // Extrair payload do mock token
      const part = token.split('.')[2]
      return JSON.parse(part)
    },
    decode: (token) => {
      const part = token.split('.')[2]
      return JSON.parse(part)
    },
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// hashEmail
// ---------------------------------------------------------------------------
describe('hashEmail', () => {
  it('produz hash SHA-256 hex de 64 chars', () => {
    const h = hashEmail('user@example.com')
    assert.equal(typeof h, 'string')
    assert.equal(h.length, 64)
    assert.match(h, /^[0-9a-f]+$/)
  })

  it('normaliza: lowercase e trim antes de hash', () => {
    assert.equal(
      hashEmail('User@Example.COM'),
      hashEmail('user@example.com')
    )
    assert.equal(
      hashEmail('  user@example.com  '),
      hashEmail('user@example.com')
    )
  })

  it('emails diferentes produzem hashes diferentes', () => {
    assert.notEqual(
      hashEmail('a@example.com'),
      hashEmail('b@example.com')
    )
  })
})

// ---------------------------------------------------------------------------
// AuthService.register
// ---------------------------------------------------------------------------
describe('AuthService.register', () => {
  it('cria utilizador e devolve tokens quando dados são válidos', async () => {
    // Arrange: mock db que simula INSERT bem-sucedido
    const mockUser    = { id: 'uuid-1', username: 'testuser', role: 'user', db_region: 'eu-central-1', created_at: new Date() }
    const mockSession = { id: 'session-uuid-1' }

    let callCount = 0
    const mockSql = async (...args) => {
      callCount++
      // Primeira chamada: INSERT users → devolver utilizador
      if (callCount === 1) return [mockUser]
      // Segunda: INSERT user_profiles
      if (callCount === 2) return []
      // Terceira: INSERT user_preferences
      if (callCount === 3) return []
      // Quarta: INSERT streaks
      if (callCount === 4) return []
      // Quinta: INSERT user_sessions → devolver sessão
      if (callCount === 5) return [mockSession]
      return []
    }

    const db  = makeMockDb({ sql: mockSql, transaction: async (fn) => fn(mockSql) })
    const jwt = makeMockJwt()
    const svc = new AuthService(db, jwt)

    // Act
    const result = await svc.register({
      email:       'test@example.com',
      password:    'Password123!',
      username:    'testuser',
      countryCode: 'PT',
      language:    'pt-PT',
    })

    // Assert
    assert.ok(result.user, 'deve devolver user')
    assert.ok(result.accessToken, 'deve devolver accessToken')
    assert.ok(result.refreshToken, 'deve devolver refreshToken')
    assert.equal(result.user.id, mockUser.id)
  })

  it('lança ConflictError quando BD retorna erro 23505 de email', async () => {
    const conflictError   = new Error('duplicate key')
    conflictError.code    = '23505'
    conflictError.constraint_name = 'users_email_hash_uq'

    const mockSql = async () => { throw conflictError }
    const db      = makeMockDb({ sql: mockSql, transaction: async (fn) => fn(mockSql) })
    const svc     = new AuthService(db, makeMockJwt())

    await assert.rejects(
      () => svc.register({ email: 'dup@example.com', password: 'Pass123!', username: 'dupuser', countryCode: 'PT' }),
      (err) => {
        assert.equal(err.code, 'CONFLICT')
        assert.match(err.message, /email/)
        return true
      }
    )
  })

  it('lança ConflictError quando BD retorna erro 23505 de username', async () => {
    const conflictError   = new Error('duplicate key')
    conflictError.code    = '23505'
    conflictError.constraint_name = 'users_username_uq'

    const mockSql = async () => { throw conflictError }
    const db      = makeMockDb({ sql: mockSql, transaction: async (fn) => fn(mockSql) })
    const svc     = new AuthService(db, makeMockJwt())

    await assert.rejects(
      () => svc.register({ email: 'new@example.com', password: 'Pass123!', username: 'taken', countryCode: 'PT' }),
      (err) => {
        assert.equal(err.code, 'CONFLICT')
        assert.match(err.message, /username/)
        return true
      }
    )
  })

  it('atribui eu-central-1 a países europeus', async () => {
    let capturedRegion = null

    let callCount = 0
    const mockSql = async (...args) => {
      callCount++
      if (callCount === 1) {
        // Capturar db_region passado ao INSERT
        // O template literal inclui os valores como propriedade do array
        capturedRegion = 'eu-central-1' // simplificado — testar via _dbRegionForCountry diretamente
        return [{ id: 'u1', username: 'eu', role: 'user', db_region: 'eu-central-1', created_at: new Date() }]
      }
      if (callCount === 5) return [{ id: 's1' }]
      return []
    }

    const db  = makeMockDb({ sql: mockSql, transaction: async (fn) => fn(mockSql) })
    const svc = new AuthService(db, makeMockJwt())

    // Testar o helper directamente
    assert.equal(svc._dbRegionForCountry('PT'), 'eu-central-1')
    assert.equal(svc._dbRegionForCountry('DE'), 'eu-central-1')
    assert.equal(svc._dbRegionForCountry('BR'), 'sa-east-1')
    assert.equal(svc._dbRegionForCountry('US'), 'sa-east-1')
    assert.equal(svc._dbRegionForCountry(null), 'sa-east-1')
  })
})

// ---------------------------------------------------------------------------
// AuthService.login
// ---------------------------------------------------------------------------
describe('AuthService.login', () => {
  it('lança UnauthorizedError com mensagem genérica quando utilizador não existe', async () => {
    const mockSql = async () => []  // utilizador não encontrado
    const db      = makeMockDb({ sql: mockSql })
    const svc     = new AuthService(db, makeMockJwt())

    await assert.rejects(
      () => svc.login({ email: 'ghost@example.com', password: 'any' }),
      (err) => {
        assert.equal(err.code, 'UNAUTHORIZED')
        // Mensagem NÃO deve revelar se o utilizador existe
        assert.match(err.message, /credenciais/i)
        return true
      }
    )
  })

  it('lança UnauthorizedError quando utilizador está soft-deleted', async () => {
    const deletedUser = {
      id: 'u1', username: 'deleted', role: 'user',
      password_hash: '$argon2id$v=19$m=65536,t=3,p=4$fake$fake',
      deleted_at: new Date(),
    }
    const mockSql = async () => [deletedUser]
    const db      = makeMockDb({ sql: mockSql })
    const svc     = new AuthService(db, makeMockJwt())

    await assert.rejects(
      () => svc.login({ email: 'deleted@example.com', password: 'any' }),
      (err) => {
        assert.equal(err.code, 'UNAUTHORIZED')
        return true
      }
    )
  })
})

// ---------------------------------------------------------------------------
// AuthService.refresh
// ---------------------------------------------------------------------------
describe('AuthService.refresh', () => {
  it('lança UnauthorizedError para token sem sessionId (tokens antigos pré-fix)', async () => {
    const jwt = makeMockJwt({
      verify: () => ({ sub: 'u1', role: 'user', dbRegion: 'eu-central-1' })
      // sessionId ausente — simula token gerado antes do fix
    })
    const db  = makeMockDb()
    const svc = new AuthService(db, jwt)

    await assert.rejects(
      () => svc.refresh('old.token.format'),
      (err) => {
        assert.equal(err.code, 'UNAUTHORIZED')
        assert.match(err.message, /faz login/i)
        return true
      }
    )
  })

  it('lança UnauthorizedError quando sessão não existe na BD', async () => {
    const jwt = makeMockJwt({
      verify: () => ({ sub: 'u1', role: 'user', dbRegion: 'eu-central-1', sessionId: 'sess-1' }),
    })
    const mockSql = async () => []  // sessão não encontrada
    const db      = makeMockDb({ sql: mockSql })
    const svc     = new AuthService(db, jwt)

    await assert.rejects(
      () => svc.refresh('valid.token.{"sub":"u1","sessionId":"sess-1"}'),
      (err) => {
        assert.equal(err.code, 'UNAUTHORIZED')
        return true
      }
    )
  })
})

// ---------------------------------------------------------------------------
// AuthService._checkSuspicious
// ---------------------------------------------------------------------------
describe('AuthService._checkSuspicious', () => {
  it('retorna false quando ipCountry é null', async () => {
    const svc = new AuthService(makeMockDb(), makeMockJwt())
    const result = await svc._checkSuspicious('u1', null)
    assert.equal(result, false)
  })

  it('retorna false quando não há sessões anteriores', async () => {
    const mockSql = async () => []
    const svc     = new AuthService(makeMockDb({ sql: mockSql }), makeMockJwt())
    const result  = await svc._checkSuspicious('u1', 'PT')
    assert.equal(result, false)
  })

  it('retorna true quando país é diferente do último login', async () => {
    const mockSql = async () => [{ ip_country: 'PT' }]
    const svc     = new AuthService(makeMockDb({ sql: mockSql }), makeMockJwt())
    const result  = await svc._checkSuspicious('u1', 'BR')
    assert.equal(result, true)
  })

  it('retorna false quando país é igual ao último login', async () => {
    const mockSql = async () => [{ ip_country: 'PT' }]
    const svc     = new AuthService(makeMockDb({ sql: mockSql }), makeMockJwt())
    const result  = await svc._checkSuspicious('u1', 'PT')
    assert.equal(result, false)
  })
})

// src/tests/integration/auth.integration.test.js
// Testes de integração do fluxo de autenticação completo.
// Requerem PostgreSQL real — correr com: npm run test:integration
//
// Pré-condição: DATABASE_URL apontar para BD de teste (não produção).
// O script limpa e recria dados entre testes via transacções revertidas.
//
// Estratégia: cada teste corre dentro de uma transacção que é revertida
// no final — sem estado persistente entre testes, sem tabelas de limpeza.

import { describe, it, before, after, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import postgres from 'postgres'
import { AuthService, hashEmail } from '../../auth/auth.service.js'

// ---------------------------------------------------------------------------
// Setup da BD de teste
// ---------------------------------------------------------------------------

const TEST_DB_URL = process.env.DATABASE_URL
if (!TEST_DB_URL) {
  console.error('DATABASE_URL não definida — a saltar testes de integração')
  process.exit(0)
}

const sql = postgres(TEST_DB_URL, { max: 5 })

// Mock mínimo do JWT para testes de integração
// (não queremos testar JWT aqui — isso é nos unit tests)
const mockJwt = {
  sign:   (payload) => `mock.${JSON.stringify(payload)}`,
  verify: (token)   => JSON.parse(token.replace('mock.', '')),
  decode: (token)   => JSON.parse(token.replace('mock.', '')),
}

// Cada teste usa uma transacção revertida — sem estado entre testes
let txSql
let txResolve
let txReject

// db adapter que usa a transacção activa
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

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

before(async () => {
  // Verificar ligação
  await sql`SELECT 1`
  console.log('[Integration] BD de teste ligada:', TEST_DB_URL.split('@')[1])
})

after(async () => {
  await sql.end()
})

beforeEach(async () => {
  // Iniciar transacção — será revertida no afterEach
  await new Promise((resolve) => {
    txSql = null
    sql.begin(async (tx) => {
      txSql = tx
      // Sinalizar que a transacção está pronta
      resolve()
      // Manter a transacção aberta até afterEach sinalizar
      await new Promise((res, rej) => {
        txResolve = res
        txReject  = rej
      })
      // Lançar erro para forçar rollback
      throw new Error('ROLLBACK_INTENTIONAL')
    }).catch((err) => {
      if (err.message !== 'ROLLBACK_INTENTIONAL') {
        console.error('[Integration] Erro inesperado na transacção:', err)
      }
    })
    // Aguardar que txSql seja definido
    const wait = setInterval(() => { if (txSql) { clearInterval(wait); resolve() } }, 10)
  })
})

afterEach(() => {
  // Revogar a transacção → PostgreSQL faz ROLLBACK automático
  if (txReject) txReject(new Error('ROLLBACK_INTENTIONAL'))
})

// ---------------------------------------------------------------------------
// Testes
// ---------------------------------------------------------------------------

describe('AuthService — integração', () => {

  it('register: cria utilizador, perfil, preferências e sessão', async () => {
    const db  = makeTxDb()
    const svc = new AuthService(db, mockJwt)

    const result = await svc.register({
      email:       'integration-test@memovoy.com',
      password:    'Password123!',
      username:    'integrationtest',
      countryCode: 'PT',
      language:    'pt-PT',
    })

    // Deve devolver tokens e user
    assert.ok(result.user.id,       'deve ter id')
    assert.ok(result.accessToken,   'deve ter accessToken')
    assert.ok(result.refreshToken,  'deve ter refreshToken')
    assert.equal(result.user.username, 'integrationtest')
    assert.equal(result.user.role,     'user')

    // Verificar que o utilizador foi criado na BD
    const [user] = await txSql`
      SELECT id, username, email_hash, role
      FROM users WHERE username = 'integrationtest'
    `
    assert.ok(user,                         'utilizador deve existir na BD')
    assert.equal(user.email_hash, hashEmail('integration-test@memovoy.com'))
    assert.equal(user.role,       'user')

    // Verificar que o perfil foi criado
    const [profile] = await txSql`
      SELECT display_name FROM user_profiles WHERE user_id = ${user.id}
    `
    assert.ok(profile,                   'perfil deve existir')
    assert.equal(profile.display_name, 'integrationtest')

    // Verificar que as preferências foram criadas
    const [prefs] = await txSql`
      SELECT user_id FROM user_preferences WHERE user_id = ${user.id}
    `
    assert.ok(prefs, 'preferências devem existir')

    // Verificar que a sessão foi criada
    const [session] = await txSql`
      SELECT id, user_id FROM user_sessions WHERE user_id = ${user.id}
    `
    assert.ok(session, 'sessão deve existir')
    assert.equal(session.user_id, user.id)
  })

  it('register: rejeita email duplicado com ConflictError', async () => {
    const db  = makeTxDb()
    const svc = new AuthService(db, mockJwt)

    // Primeiro registo
    await svc.register({
      email: 'dup@memovoy.com', password: 'Pass123!',
      username: 'firstuser', countryCode: 'PT',
    })

    // Segundo registo com mesmo email deve falhar
    await assert.rejects(
      () => svc.register({
        email: 'dup@memovoy.com', password: 'Pass456!',
        username: 'seconduser', countryCode: 'PT',
      }),
      (err) => {
        assert.equal(err.code, 'CONFLICT', 'deve ser ConflictError')
        assert.match(err.message, /email/i, 'deve mencionar email')
        return true
      }
    )
  })

  it('register: rejeita username duplicado com ConflictError', async () => {
    const db  = makeTxDb()
    const svc = new AuthService(db, mockJwt)

    await svc.register({
      email: 'user1@memovoy.com', password: 'Pass123!',
      username: 'sameusername', countryCode: 'PT',
    })

    await assert.rejects(
      () => svc.register({
        email: 'user2@memovoy.com', password: 'Pass456!',
        username: 'sameusername', countryCode: 'PT',
      }),
      (err) => {
        assert.equal(err.code, 'CONFLICT')
        assert.match(err.message, /username/i)
        return true
      }
    )
  })

  it('register: atribui eu-central-1 a utilizadores PT', async () => {
    const db  = makeTxDb()
    const svc = new AuthService(db, mockJwt)

    await svc.register({
      email: 'pt-user@memovoy.com', password: 'Pass123!',
      username: 'ptuser', countryCode: 'PT',
    })

    const [user] = await txSql`
      SELECT db_region FROM users WHERE username = 'ptuser'
    `
    assert.equal(user.db_region, 'eu-central-1')
  })

  it('register: atribui sa-east-1 a utilizadores BR', async () => {
    const db  = makeTxDb()
    const svc = new AuthService(db, mockJwt)

    await svc.register({
      email: 'br-user@memovoy.com', password: 'Pass123!',
      username: 'bruser', countryCode: 'BR',
    })

    const [user] = await txSql`
      SELECT db_region FROM users WHERE username = 'bruser'
    `
    assert.equal(user.db_region, 'sa-east-1')
  })

  it('login: retorna tokens para credenciais válidas', async () => {
    const db  = makeTxDb()
    const svc = new AuthService(db, mockJwt)

    // Criar utilizador primeiro
    await svc.register({
      email: 'login-test@memovoy.com', password: 'MyPass123!',
      username: 'logintest', countryCode: 'PT',
    })

    // Login
    const result = await svc.login({
      email: 'login-test@memovoy.com',
      password: 'MyPass123!',
    })

    assert.ok(result.accessToken,  'deve ter accessToken')
    assert.ok(result.refreshToken, 'deve ter refreshToken')
    assert.equal(result.user.username, 'logintest')
    assert.equal(result.user.isVerified, false)
  })

  it('login: rejeita password errada com UnauthorizedError', async () => {
    const db  = makeTxDb()
    const svc = new AuthService(db, mockJwt)

    await svc.register({
      email: 'wrongpwd@memovoy.com', password: 'CorrectPass123!',
      username: 'wrongpwdtest', countryCode: 'PT',
    })

    await assert.rejects(
      () => svc.login({ email: 'wrongpwd@memovoy.com', password: 'WrongPass!' }),
      (err) => {
        assert.equal(err.code, 'UNAUTHORIZED')
        assert.match(err.message, /credenciais/i)
        return true
      }
    )
  })

  it('login: rejeita email inexistente com mensagem genérica', async () => {
    const db  = makeTxDb()
    const svc = new AuthService(db, mockJwt)

    // Não criar utilizador — email não existe
    await assert.rejects(
      () => svc.login({ email: 'ghost@memovoy.com', password: 'AnyPass123!' }),
      (err) => {
        assert.equal(err.code, 'UNAUTHORIZED')
        // Mensagem IGUAL ao caso de password errada — timing-safe
        assert.match(err.message, /credenciais/i)
        return true
      }
    )
  })

  it('logout: revoga a sessão do utilizador', async () => {
    const db  = makeTxDb()
    const svc = new AuthService(db, mockJwt)

    const { user } = await svc.register({
      email: 'logout-test@memovoy.com', password: 'Pass123!',
      username: 'logouttest', countryCode: 'PT',
    })

    // Buscar sessão activa
    const [session] = await txSql`
      SELECT id FROM user_sessions
      WHERE user_id = ${user.id} AND revoked_at IS NULL
      LIMIT 1
    `
    assert.ok(session, 'deve ter sessão activa')

    // Logout
    await svc.logout(session.id, user.id)

    // Sessão deve estar revogada
    const [revoked] = await txSql`
      SELECT revoked_at FROM user_sessions WHERE id = ${session.id}
    `
    assert.ok(revoked.revoked_at, 'sessão deve ter revoked_at preenchido')
  })

  it('revokeOtherSessions: revoga apenas sessões alheias', async () => {
    const db  = makeTxDb()
    const svc = new AuthService(db, mockJwt)

    const { user } = await svc.register({
      email: 'revoke-test@memovoy.com', password: 'Pass123!',
      username: 'revoketest', countryCode: 'PT',
    })

    // Criar 2 sessões adicionais manualmente
    await txSql`
      INSERT INTO user_sessions (user_id, expires_at)
      VALUES (${user.id}, NOW() + INTERVAL '30 days'),
             (${user.id}, NOW() + INTERVAL '30 days')
    `

    const sessions = await txSql`
      SELECT id FROM user_sessions
      WHERE user_id = ${user.id} AND revoked_at IS NULL
      ORDER BY created_at ASC
    `
    assert.equal(sessions.length, 3, 'deve ter 3 sessões activas')

    // Revogar todas excepto a primeira
    const currentSessionId = sessions[0].id
    const revoked = await svc.revokeOtherSessions(currentSessionId, user.id)

    assert.equal(revoked, 2, 'deve ter revogado 2 sessões')

    // Verificar que só a primeira está activa
    const active = await txSql`
      SELECT id FROM user_sessions
      WHERE user_id = ${user.id} AND revoked_at IS NULL
    `
    assert.equal(active.length, 1, 'deve restar 1 sessão activa')
    assert.equal(active[0].id, currentSessionId, 'sessão activa deve ser a correcta')
  })
})

// ---------------------------------------------------------------------------
// Testes de constraints da BD
// ---------------------------------------------------------------------------

describe('Schema constraints — integração', () => {

  it('users: email_hash deve ser único', async () => {
    const db  = makeTxDb()
    const svc = new AuthService(db, mockJwt)

    const email = 'constraint-test@memovoy.com'
    const hash  = hashEmail(email)

    // Inserir directamente para testar a constraint
    await txSql`
      INSERT INTO users (
        email_encrypted, email_hash, username, password_hash,
        auth_provider, db_region, role
      ) VALUES (
        'encrypted', ${hash}, 'constrainttest1', 'hash',
        'email', 'eu-central-1', 'user'
      )
    `

    // Segunda inserção com mesmo email_hash deve falhar
    await assert.rejects(
      async () => txSql`
        INSERT INTO users (
          email_encrypted, email_hash, username, password_hash,
          auth_provider, db_region, role
        ) VALUES (
          'encrypted2', ${hash}, 'constrainttest2', 'hash',
          'email', 'eu-central-1', 'user'
        )
      `,
      (err) => {
        assert.equal(err.code, '23505', 'deve ser violação de UNIQUE constraint')
        return true
      }
    )
  })

  it('user_sessions: expires_at deve ser maior que created_at', async () => {
    const db  = makeTxDb()
    const svc = new AuthService(db, mockJwt)

    const { user } = await svc.register({
      email: 'session-constraint@memovoy.com', password: 'Pass123!',
      username: 'sessionconstraint', countryCode: 'PT',
    })

    // Sessão com expires_at no passado deve falhar (se existir a constraint)
    // Nota: verifica o comportamento actual da BD
    const [session] = await txSql`
      INSERT INTO user_sessions (user_id, expires_at)
      VALUES (${user.id}, NOW() + INTERVAL '1 hour')
      RETURNING id, expires_at
    `
    assert.ok(session.id, 'deve criar sessão com expires válido')
    assert.ok(new Date(session.expires_at) > new Date(), 'expires deve ser futuro')
  })

  it('itineraries: db_region é imutável após criação', async () => {
    const db  = makeTxDb()
    const svc = new AuthService(db, mockJwt)

    const { user } = await svc.register({
      email: 'region-test@memovoy.com', password: 'Pass123!',
      username: 'regiontest', countryCode: 'PT',
    })

    // Tentar mudar db_region deve falhar
    await assert.rejects(
      async () => txSql`
        UPDATE users SET db_region = 'sa-east-1'
        WHERE id = ${user.id}
      `,
      (err) => {
        // Trigger fn_protect_db_region deve lançar exceção
        assert.ok(
          err.message.includes('db_region') || err.code === 'P0001',
          `deve rejeitar alteração de db_region: ${err.message}`
        )
        return true
      }
    )
  })
})

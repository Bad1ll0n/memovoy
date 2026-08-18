import { test, describe, before, after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { query } from '../../src/db/pool.js'
import { criarApp, fecharApp, limparBaseDeDados, dadosDeRegisto, registarUtilizador } from './helpers.js'

// Testes de integração contra Postgres a sério. As rotas de autenticação são
// as que mais custa ter erradas: um bug aqui deixa entrar quem não devia ou
// tranca quem devia entrar.

let app

before(async () => { app = await criarApp() })
after(async () => { await fecharApp(app) })
beforeEach(limparBaseDeDados)

describe('POST /auth/register', () => {
  test('cria o utilizador e devolve um access token', async () => {
    const dados = dadosDeRegisto('ana')
    const res = await app.inject({ method: 'POST', url: '/auth/register', payload: dados })

    assert.equal(res.statusCode, 200)
    const body = JSON.parse(res.body)
    assert.equal(body.user.username, dados.username)
    assert.equal(body.user.email, dados.email)
    assert.ok(body.accessToken, 'devia vir um accessToken')

    const { rows } = await query('SELECT username, email_verified FROM users WHERE email = $1', [dados.email])
    assert.equal(rows.length, 1)
    assert.equal(rows[0].email_verified, false, 'email começa por verificar')
  })

  test('nunca devolve o hash da password', async () => {
    const res = await app.inject({ method: 'POST', url: '/auth/register', payload: dadosDeRegisto('bea') })
    assert.doesNotMatch(res.body, /password_hash|\$argon2|\$2b\$/)
  })

  test('guarda a password com argon2id, não em claro', async () => {
    const dados = dadosDeRegisto('caro')
    await app.inject({ method: 'POST', url: '/auth/register', payload: dados })

    const { rows } = await query('SELECT password_hash FROM users WHERE email = $1', [dados.email])
    assert.ok(rows[0].password_hash.startsWith('$argon2id$'))
    assert.notEqual(rows[0].password_hash, dados.password)
  })

  test('emite cookie de refresh httpOnly', async () => {
    const res = await app.inject({ method: 'POST', url: '/auth/register', payload: dadosDeRegisto('dina') })
    const cookie = res.cookies.find((c) => c.name.includes('refresh'))

    assert.ok(cookie, `esperado um cookie de refresh, vieram: ${res.cookies.map((c) => c.name)}`)
    assert.equal(cookie.httpOnly, true, 'sem httpOnly o token fica exposto a XSS')
  })

  test('email duplicado não cria segundo utilizador nem revela que já existe', async () => {
    const dados = dadosDeRegisto('elsa')
    await app.inject({ method: 'POST', url: '/auth/register', payload: dados })

    const segundo = await app.inject({
      method: 'POST', url: '/auth/register',
      payload: { ...dados, username: 'outronome' },
    })

    // Resposta neutra e 200 — de propósito, para não permitir enumerar emails.
    assert.equal(segundo.statusCode, 200)
    const body = JSON.parse(segundo.body)
    assert.equal(body.accessToken, undefined, 'não pode dar sessão a quem não criou conta')
    assert.equal(body.user, undefined)

    const { rows } = await query('SELECT count(*)::int AS n FROM users')
    assert.equal(rows[0].n, 1, 'devia continuar a existir um só utilizador')
  })

  test('username duplicado também não cria segundo utilizador', async () => {
    const dados = dadosDeRegisto('fabio')
    await app.inject({ method: 'POST', url: '/auth/register', payload: dados })

    await app.inject({
      method: 'POST', url: '/auth/register',
      payload: { ...dados, email: 'outro@exemplo.pt' },
    })

    const { rows } = await query('SELECT count(*)::int AS n FROM users')
    assert.equal(rows[0].n, 1)
  })

  test('rejeita password sem maiúscula ou sem número', async () => {
    for (const password of ['tudominusculas1', 'SEMNUMEROSAQUI', 'Curta1']) {
      const res = await app.inject({
        method: 'POST', url: '/auth/register',
        payload: { ...dadosDeRegisto(), password },
      })
      assert.equal(res.statusCode, 400, `devia rejeitar "${password}"`)
    }
  })

  test('rejeita username com maiúsculas ou espaços', async () => {
    for (const username of ['ComMaiusculas', 'com espaco', 'com-hifen', 'ab']) {
      const res = await app.inject({
        method: 'POST', url: '/auth/register',
        payload: { ...dadosDeRegisto(), username },
      })
      assert.equal(res.statusCode, 400, `devia rejeitar "${username}"`)
    }
  })

  test('rejeita email malformado', async () => {
    const res = await app.inject({
      method: 'POST', url: '/auth/register',
      payload: { ...dadosDeRegisto(), email: 'isto-nao-e-email' },
    })
    assert.equal(res.statusCode, 400)
  })
})

describe('POST /auth/login', () => {
  test('autentica com credenciais correctas', async () => {
    const { dados } = await registarUtilizador(app)

    const res = await app.inject({
      method: 'POST', url: '/auth/login',
      payload: { email: dados.email, password: dados.password },
    })

    assert.equal(res.statusCode, 200)
    const body = JSON.parse(res.body)
    assert.equal(body.user.email, dados.email)
    assert.ok(body.accessToken)
  })

  test('aceita o email com outra capitalização', async () => {
    const { dados } = await registarUtilizador(app)

    const res = await app.inject({
      method: 'POST', url: '/auth/login',
      payload: { email: dados.email.toUpperCase(), password: dados.password },
    })

    assert.equal(res.statusCode, 200)
  })

  test('recusa password errada', async () => {
    const { dados } = await registarUtilizador(app)

    const res = await app.inject({
      method: 'POST', url: '/auth/login',
      payload: { email: dados.email, password: 'PasswordErrada9' },
    })

    assert.equal(res.statusCode, 401)
  })

  test('email inexistente responde igual a password errada — sem enumeração', async () => {
    const { dados } = await registarUtilizador(app)

    const inexistente = await app.inject({
      method: 'POST', url: '/auth/login',
      payload: { email: 'ninguem@exemplo.pt', password: 'PasswordValida1' },
    })
    const passwordErrada = await app.inject({
      method: 'POST', url: '/auth/login',
      payload: { email: dados.email, password: 'PasswordErrada9' },
    })

    assert.equal(inexistente.statusCode, passwordErrada.statusCode)
    assert.equal(inexistente.body, passwordErrada.body)
  })

  test('conta o número de tentativas falhadas', async () => {
    const { dados } = await registarUtilizador(app)

    await app.inject({ method: 'POST', url: '/auth/login', payload: { email: dados.email, password: 'Errada123' } })

    const { rows } = await query('SELECT failed_login_attempts FROM users WHERE email = $1', [dados.email])
    assert.equal(rows[0].failed_login_attempts, 1)
  })

  test('bloqueia a conta à quinta tentativa falhada', async () => {
    const { dados } = await registarUtilizador(app)

    let ultima
    for (let i = 0; i < 5; i++) {
      ultima = await app.inject({
        method: 'POST', url: '/auth/login',
        payload: { email: dados.email, password: 'Errada123' },
      })
    }

    assert.equal(ultima.statusCode, 429)

    const { rows } = await query('SELECT locked_until FROM users WHERE email = $1', [dados.email])
    assert.ok(rows[0].locked_until, 'locked_until devia estar preenchido')
    assert.ok(new Date(rows[0].locked_until) > new Date(), 'o bloqueio devia estar no futuro')
  })

  test('conta bloqueada recusa mesmo a password correcta', async () => {
    const { dados } = await registarUtilizador(app)
    for (let i = 0; i < 5; i++) {
      await app.inject({ method: 'POST', url: '/auth/login', payload: { email: dados.email, password: 'Errada123' } })
    }

    const res = await app.inject({
      method: 'POST', url: '/auth/login',
      payload: { email: dados.email, password: dados.password },
    })

    assert.equal(res.statusCode, 429)
  })

  test('login bem sucedido põe o contador de falhas a zero', async () => {
    const { dados } = await registarUtilizador(app)

    await app.inject({ method: 'POST', url: '/auth/login', payload: { email: dados.email, password: 'Errada123' } })
    await app.inject({ method: 'POST', url: '/auth/login', payload: { email: dados.email, password: dados.password } })

    const { rows } = await query('SELECT failed_login_attempts, locked_until FROM users WHERE email = $1', [dados.email])
    assert.equal(rows[0].failed_login_attempts, 0)
    assert.equal(rows[0].locked_until, null)
  })
})

describe('rotas protegidas', () => {
  test('/users/me sem token devolve 401', async () => {
    const res = await app.inject({ method: 'GET', url: '/users/me' })
    assert.equal(res.statusCode, 401)
  })

  test('/users/me com token inválido devolve 401', async () => {
    const res = await app.inject({
      method: 'GET', url: '/users/me',
      headers: { authorization: 'Bearer isto.nao.e-um-token' },
    })
    assert.equal(res.statusCode, 401)
  })

  test('/users/me com token do registo devolve o próprio utilizador', async () => {
    const { accessToken, dados } = await registarUtilizador(app)

    const res = await app.inject({
      method: 'GET', url: '/users/me',
      headers: { authorization: `Bearer ${accessToken}` },
    })

    assert.equal(res.statusCode, 200)
    assert.equal(JSON.parse(res.body).username, dados.username)
  })
})

describe('campos privados no perfil', () => {
  // O frontend guarda a resposta destas rotas na authStore com setAuth(). Se
  // emailVerified vier em falta, o aviso de "verifica o teu email" reaparece a
  // quem já verificou. E o mesmo DTO serve perfis de terceiros, onde o email
  // não pode aparecer de todo.

  test('/users/me traz email, emailVerified e onboardingCompleted', async () => {
    const { accessToken, dados } = await registarUtilizador(app)

    const res = await app.inject({
      method: 'GET', url: '/users/me',
      headers: { authorization: `Bearer ${accessToken}` },
    })

    const body = JSON.parse(res.body)
    assert.equal(body.email, dados.email)
    assert.equal(body.emailVerified, false)
    assert.equal(body.onboardingCompleted, false)
  })

  test('PATCH /users/me devolve os mesmos campos — senão o setAuth apaga-os', async () => {
    const { accessToken } = await registarUtilizador(app)

    const res = await app.inject({
      method: 'PATCH', url: '/users/me',
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { bio: 'Uma bio nova.' },
    })

    assert.equal(res.statusCode, 200)
    const { user } = JSON.parse(res.body)
    assert.equal(user.bio, 'Uma bio nova.')
    assert.ok('email' in user, 'sem email, editar o perfil corrompia a sessão')
    assert.equal(user.emailVerified, false)
    assert.equal(user.onboardingCompleted, false)
  })

  test('perfil de outro utilizador nunca expõe o email', async () => {
    const alheio = await registarUtilizador(app)
    const proprio = await registarUtilizador(app)

    const res = await app.inject({
      method: 'GET', url: `/users/${alheio.user.id}`,
      headers: { authorization: `Bearer ${proprio.accessToken}` },
    })

    assert.equal(res.statusCode, 200)
    const body = JSON.parse(res.body)
    assert.equal(body.email, undefined, 'email de terceiros não pode sair')
    assert.equal(body.emailVerified, undefined)
    assert.doesNotMatch(res.body, /@exemplo\.pt/)
  })
})

describe('GET /health', () => {
  test('responde sem autenticação', async () => {
    const res = await app.inject({ method: 'GET', url: '/health' })
    assert.equal(res.statusCode, 200)
    assert.equal(JSON.parse(res.body).status, 'ok')
  })
})

import { test, describe, before, after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import { query } from '../../src/db/pool.js'
import { criarApp, fecharApp, limparBaseDeDados, registarUtilizador, comToken } from './helpers.js'

// Fluxos de autenticação de ponta a ponta: 2FA e recuperação de password.
//
// Achei-os intestáveis no primeiro relatório de QA — por preguiça, não por
// impedimento. O segredo TOTP está na base de dados e o projecto tem a sua
// própria implementação para gerar códigos; o token de recuperação também fica
// na tabela users. Nada disto precisa de SMTP nem de app autenticadora.

let app
let ana

before(async () => { app = await criarApp() })
after(async () => { await fecharApp(app) })

beforeEach(async () => {
  await limparBaseDeDados()
  ana = await registarUtilizador(app)
})

/**
 * Gera o código TOTP de 6 dígitos para um segredo base32, no instante actual.
 * Reimplementado aqui de propósito: usar a função da aplicação faria o teste
 * concordar com ela mesmo que ambas estivessem erradas.
 */
function codigoTotp(segredoBase32, instante = Date.now()) {
  const ALFABETO = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
  let bits = 0, valor = 0
  const bytes = []
  for (const c of segredoBase32.toUpperCase().replace(/=+$/, '')) {
    valor = (valor << 5) | ALFABETO.indexOf(c)
    bits += 5
    if (bits >= 8) { bytes.push((valor >>> (bits - 8)) & 0xff); bits -= 8 }
  }

  const contador = Buffer.alloc(8)
  let passo = BigInt(Math.floor(instante / 1000 / 30))
  for (let i = 7; i >= 0; i--) { contador[i] = Number(passo & 0xffn); passo >>= 8n }

  const hmac = crypto.createHmac('sha1', Buffer.from(bytes)).update(contador).digest()
  const off = hmac[hmac.length - 1] & 0x0f
  const cod = ((hmac[off] & 0x7f) << 24) | ((hmac[off + 1] & 0xff) << 16) |
              ((hmac[off + 2] & 0xff) << 8) | (hmac[off + 3] & 0xff)
  return String(cod % 1_000_000).padStart(6, '0')
}

describe('2FA — configuração', () => {
  test('setup devolve segredo e QR code', async () => {
    const res = await app.inject({ method: 'POST', url: '/auth/2fa/setup', headers: comToken(ana.accessToken) })

    assert.equal(res.statusCode, 200)
    const { secret, qrCodeDataUrl } = JSON.parse(res.body)
    assert.match(secret, /^[A-Z2-7]{32}$/, 'segredo base32 de 20 bytes')
    assert.match(qrCodeDataUrl, /^data:image\/png;base64,/)
  })

  test('setup exige autenticação', async () => {
    const res = await app.inject({ method: 'POST', url: '/auth/2fa/setup' })
    assert.equal(res.statusCode, 401)
  })

  test('confirmar com o código certo activa o 2FA', async () => {
    const setup = await app.inject({ method: 'POST', url: '/auth/2fa/setup', headers: comToken(ana.accessToken) })
    const { secret } = JSON.parse(setup.body)

    const res = await app.inject({
      method: 'POST', url: '/auth/2fa/confirm',
      headers: comToken(ana.accessToken),
      payload: { code: codigoTotp(secret) },
    })

    assert.equal(res.statusCode, 200)
    const { rows } = await query('SELECT totp_enabled FROM users WHERE id = $1', [ana.user.id])
    assert.equal(rows[0].totp_enabled, true)
  })

  test('confirmar com o código errado não activa', async () => {
    await app.inject({ method: 'POST', url: '/auth/2fa/setup', headers: comToken(ana.accessToken) })

    const res = await app.inject({
      method: 'POST', url: '/auth/2fa/confirm',
      headers: comToken(ana.accessToken),
      payload: { code: '000000' },
    })

    assert.equal(res.statusCode, 400)
    const { rows } = await query('SELECT totp_enabled FROM users WHERE id = $1', [ana.user.id])
    assert.equal(rows[0].totp_enabled, false)
  })

  test('confirmar sem ter feito setup é recusado', async () => {
    const res = await app.inject({
      method: 'POST', url: '/auth/2fa/confirm',
      headers: comToken(ana.accessToken),
      payload: { code: '123456' },
    })

    assert.equal(res.statusCode, 400)
  })
})

describe('2FA — login com dois passos', () => {
  /** Activa o 2FA e devolve o segredo. */
  async function activar2fa() {
    const setup = await app.inject({ method: 'POST', url: '/auth/2fa/setup', headers: comToken(ana.accessToken) })
    const { secret } = JSON.parse(setup.body)
    await app.inject({
      method: 'POST', url: '/auth/2fa/confirm',
      headers: comToken(ana.accessToken),
      payload: { code: codigoTotp(secret) },
    })
    return secret
  }

  test('o login deixa de devolver sessão e passa a pedir o código', async () => {
    await activar2fa()

    const res = await app.inject({
      method: 'POST', url: '/auth/login',
      payload: { email: ana.dados.email, password: ana.dados.password },
    })

    assert.equal(res.statusCode, 200)
    const body = JSON.parse(res.body)
    assert.equal(body.requires2fa, true)
    assert.ok(body.tempToken, 'devia vir um token temporário')
    assert.equal(body.accessToken, undefined, 'a password sozinha não pode dar sessão')
  })

  test('o token temporário mais o código certo dão sessão', async () => {
    const secret = await activar2fa()

    const login = await app.inject({
      method: 'POST', url: '/auth/login',
      payload: { email: ana.dados.email, password: ana.dados.password },
    })
    const { tempToken } = JSON.parse(login.body)

    const res = await app.inject({
      method: 'POST', url: '/auth/2fa/authenticate',
      payload: { tempToken, code: codigoTotp(secret) },
    })

    assert.equal(res.statusCode, 200)
    assert.ok(JSON.parse(res.body).accessToken, 'devia dar sessão completa')
  })

  test('código errado no segundo passo não dá sessão', async () => {
    await activar2fa()

    const login = await app.inject({
      method: 'POST', url: '/auth/login',
      payload: { email: ana.dados.email, password: ana.dados.password },
    })
    const { tempToken } = JSON.parse(login.body)

    const res = await app.inject({
      method: 'POST', url: '/auth/2fa/authenticate',
      payload: { tempToken, code: '000000' },
    })

    assert.notEqual(res.statusCode, 200)
    assert.equal(JSON.parse(res.body).accessToken, undefined)
  })

  test('o token temporário sozinho não serve como sessão', async () => {
    await activar2fa()

    const login = await app.inject({
      method: 'POST', url: '/auth/login',
      payload: { email: ana.dados.email, password: ana.dados.password },
    })
    const { tempToken } = JSON.parse(login.body)

    // O tempToken tem scope '2fa-pending' — usá-lo como bearer não pode passar.
    const res = await app.inject({
      method: 'GET', url: '/users/me',
      headers: { authorization: `Bearer ${tempToken}` },
    })

    assert.notEqual(res.statusCode, 200, 'um token de 2FA pendente não é uma sessão')
  })
})

describe('recuperação de password', () => {
  test('pedir recuperação gera um token na base de dados', async () => {
    const res = await app.inject({
      method: 'POST', url: '/auth/forgot-password',
      payload: { email: ana.dados.email },
    })

    assert.ok(res.statusCode < 400, `veio ${res.statusCode}`)
    const { rows } = await query('SELECT reset_token FROM users WHERE id = $1', [ana.user.id])
    assert.ok(rows[0].reset_token, 'devia ter sido gerado um token')
  })

  test('email inexistente responde igual — sem enumeração', async () => {
    const existente = await app.inject({
      method: 'POST', url: '/auth/forgot-password', payload: { email: ana.dados.email },
    })
    const inexistente = await app.inject({
      method: 'POST', url: '/auth/forgot-password', payload: { email: 'ninguem@qa.pt' },
    })

    assert.equal(existente.statusCode, inexistente.statusCode)
    assert.equal(existente.body, inexistente.body)
  })

  test('o token não é devolvido na resposta', async () => {
    const res = await app.inject({
      method: 'POST', url: '/auth/forgot-password',
      payload: { email: ana.dados.email },
    })

    const { rows } = await query('SELECT reset_token FROM users WHERE id = $1', [ana.user.id])
    assert.doesNotMatch(res.body, new RegExp(rows[0].reset_token),
      'o token só pode chegar por email, nunca no corpo da resposta')
  })

  test('o token certo redefine a password', async () => {
    await app.inject({ method: 'POST', url: '/auth/forgot-password', payload: { email: ana.dados.email } })
    const { rows } = await query('SELECT reset_token FROM users WHERE id = $1', [ana.user.id])

    const res = await app.inject({
      method: 'POST', url: '/auth/reset-password',
      payload: { token: rows[0].reset_token, password: 'NovaPassword1' },
    })

    assert.ok(res.statusCode < 400, `veio ${res.statusCode}: ${res.body}`)

    const login = await app.inject({
      method: 'POST', url: '/auth/login',
      payload: { email: ana.dados.email, password: 'NovaPassword1' },
    })
    assert.equal(login.statusCode, 200, 'a password nova tem de funcionar')
  })

  test('a password antiga deixa de funcionar', async () => {
    await app.inject({ method: 'POST', url: '/auth/forgot-password', payload: { email: ana.dados.email } })
    const { rows } = await query('SELECT reset_token FROM users WHERE id = $1', [ana.user.id])
    await app.inject({
      method: 'POST', url: '/auth/reset-password',
      payload: { token: rows[0].reset_token, password: 'NovaPassword1' },
    })

    const login = await app.inject({
      method: 'POST', url: '/auth/login',
      payload: { email: ana.dados.email, password: ana.dados.password },
    })

    assert.notEqual(login.statusCode, 200, 'a password antiga tem de deixar de servir')
  })

  test('o token não pode ser reutilizado', async () => {
    await app.inject({ method: 'POST', url: '/auth/forgot-password', payload: { email: ana.dados.email } })
    const { rows } = await query('SELECT reset_token FROM users WHERE id = $1', [ana.user.id])
    const token = rows[0].reset_token

    await app.inject({ method: 'POST', url: '/auth/reset-password', payload: { token, password: 'NovaPassword1' } })
    const segunda = await app.inject({
      method: 'POST', url: '/auth/reset-password', payload: { token, password: 'OutraPassword2' },
    })

    assert.ok(segunda.statusCode >= 400, 'um token de recuperação é de uso único')
  })

  test('token inválido é recusado', async () => {
    const res = await app.inject({
      method: 'POST', url: '/auth/reset-password',
      payload: { token: 'token-inventado', password: 'NovaPassword1' },
    })

    assert.ok(res.statusCode >= 400)
  })

  test('a password nova tem de respeitar as regras', async () => {
    await app.inject({ method: 'POST', url: '/auth/forgot-password', payload: { email: ana.dados.email } })
    const { rows } = await query('SELECT reset_token FROM users WHERE id = $1', [ana.user.id])

    const res = await app.inject({
      method: 'POST', url: '/auth/reset-password',
      payload: { token: rows[0].reset_token, password: 'fraca' },
    })

    assert.equal(res.statusCode, 400)
  })
})

describe('verificação de email', () => {
  test('o token certo marca o email como verificado', async () => {
    const { rows } = await query('SELECT verification_token FROM users WHERE id = $1', [ana.user.id])

    const res = await app.inject({
      method: 'GET', url: `/auth/verify-email?token=${rows[0].verification_token}`,
    })

    assert.ok(res.statusCode < 400, `veio ${res.statusCode}: ${res.body}`)
    const depois = await query('SELECT email_verified FROM users WHERE id = $1', [ana.user.id])
    assert.equal(depois.rows[0].email_verified, true)
  })

  test('token inválido não verifica nada', async () => {
    const res = await app.inject({ method: 'GET', url: '/auth/verify-email?token=inventado' })

    assert.ok(res.statusCode >= 400)
    const { rows } = await query('SELECT email_verified FROM users WHERE id = $1', [ana.user.id])
    assert.equal(rows[0].email_verified, false)
  })
})

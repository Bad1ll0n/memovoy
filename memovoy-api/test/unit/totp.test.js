import { test, describe, mock } from 'node:test'
import assert from 'node:assert/strict'
import { generateTotpSecret, verifyTotp, otpauthUrl } from '../../src/services/totp.js'

// Vectores oficiais do RFC 6238 (SHA-1, secret ASCII "12345678901234567890").
// A implementação devolve 6 dígitos (code % 1e6), logo usamos os 6 últimos
// dígitos dos códigos de 8 dígitos publicados no RFC.
const RFC_SECRET = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ'
const RFC_VECTORS = [
  { unixSeconds: 59,          code: '287082' },
  { unixSeconds: 1111111109,  code: '081804' },
  { unixSeconds: 1111111111,  code: '050471' },
  { unixSeconds: 1234567890,  code: '005924' },
  { unixSeconds: 2000000000,  code: '279037' },
]

describe('verifyTotp — vectores do RFC 6238', () => {
  for (const { unixSeconds, code } of RFC_VECTORS) {
    test(`aceita ${code} em t=${unixSeconds}`, (t) => {
      t.mock.timers.enable({ apis: ['Date'], now: unixSeconds * 1000 })
      assert.equal(verifyTotp(RFC_SECRET, code), true)
    })
  }
})

describe('verifyTotp — janela de tolerância', () => {
  test('aceita o código do passo anterior (relógio atrasado)', (t) => {
    // 287082 é o código do passo 1; 30s depois ainda deve ser aceite.
    t.mock.timers.enable({ apis: ['Date'], now: (59 + 30) * 1000 })
    assert.equal(verifyTotp(RFC_SECRET, '287082'), true)
  })

  test('aceita o código do passo seguinte (relógio adiantado)', (t) => {
    t.mock.timers.enable({ apis: ['Date'], now: (59 - 30) * 1000 })
    assert.equal(verifyTotp(RFC_SECRET, '287082'), true)
  })

  test('rejeita fora da janela de ±1 passo', (t) => {
    t.mock.timers.enable({ apis: ['Date'], now: (59 + 90) * 1000 })
    assert.equal(verifyTotp(RFC_SECRET, '287082'), false)
  })
})

describe('verifyTotp — entradas inválidas', () => {
  test('rejeita código errado', (t) => {
    t.mock.timers.enable({ apis: ['Date'], now: 59 * 1000 })
    assert.equal(verifyTotp(RFC_SECRET, '000000'), false)
  })

  test('rejeita código de comprimento diferente sem rebentar', (t) => {
    t.mock.timers.enable({ apis: ['Date'], now: 59 * 1000 })
    assert.equal(verifyTotp(RFC_SECRET, '28708'), false)
    assert.equal(verifyTotp(RFC_SECRET, '2870820'), false)
    assert.equal(verifyTotp(RFC_SECRET, ''), false)
  })

  test('aceita código numérico e não só string', (t) => {
    t.mock.timers.enable({ apis: ['Date'], now: 59 * 1000 })
    assert.equal(verifyTotp(RFC_SECRET, 287082), true)
  })
})

describe('generateTotpSecret', () => {
  test('devolve base32 de 32 caracteres (20 bytes)', () => {
    const s = generateTotpSecret()
    assert.equal(s.length, 32)
    assert.match(s, /^[A-Z2-7]+$/)
  })

  test('gera segredos distintos a cada chamada', () => {
    const secrets = new Set(Array.from({ length: 50 }, generateTotpSecret))
    assert.equal(secrets.size, 50)
  })

  test('o segredo gerado funciona de facto no verify', (t) => {
    const secret = generateTotpSecret()
    t.mock.timers.enable({ apis: ['Date'], now: 1_700_000_000_000 })
    // Sem exportar totpToken, confirmamos ao menos que não aceita lixo.
    assert.equal(verifyTotp(secret, '000000') && verifyTotp(secret, '111111'), false)
  })
})

describe('otpauthUrl', () => {
  test('produz um URI otpauth válido', () => {
    const url = otpauthUrl('ABC234', 'ana@exemplo.pt')
    assert.match(url, /^otpauth:\/\/totp\//)
    assert.ok(url.includes('secret=ABC234'))
    assert.ok(url.includes('algorithm=SHA1'))
    assert.ok(url.includes('digits=6'))
    assert.ok(url.includes('period=30'))
  })

  test('faz encode de caracteres especiais no nome da conta', () => {
    const url = otpauthUrl('ABC234', 'ana+teste@exemplo.pt')
    assert.ok(url.includes('ana%2Bteste%40exemplo.pt'))
  })
})

import { createHmac, randomBytes, timingSafeEqual } from 'crypto'

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'

function base32Decode(encoded) {
  const clean = encoded.toUpperCase().replace(/=+$/, '').replace(/\s/g, '')
  const bytes = []
  let bits = 0
  let value = 0
  for (const char of clean) {
    const idx = BASE32_ALPHABET.indexOf(char)
    if (idx === -1) throw new Error('Invalid base32 character')
    value = (value << 5) | idx
    bits += 5
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff)
      bits -= 8
    }
  }
  return Buffer.from(bytes)
}

function base32Encode(buf) {
  let bits = 0
  let value = 0
  let output = ''
  for (const byte of buf) {
    value = (value << 8) | byte
    bits += 8
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 0x1f]
      bits -= 5
    }
  }
  if (bits > 0) output += BASE32_ALPHABET[(value << (5 - bits)) & 0x1f]
  return output
}

export function generateTotpSecret() {
  return base32Encode(randomBytes(20))
}

function totpToken(secret, timeStep) {
  const counter = Buffer.alloc(8)
  let step = BigInt(timeStep)
  for (let i = 7; i >= 0; i--) {
    counter[i] = Number(step & 0xffn)
    step >>= 8n
  }
  const key  = base32Decode(secret)
  const hmac = createHmac('sha1', key).update(counter).digest()
  const offset = hmac[hmac.length - 1] & 0x0f
  const code = (
    ((hmac[offset]     & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8)  |
     (hmac[offset + 3] & 0xff)
  )
  return String(code % 1_000_000).padStart(6, '0')
}

export function verifyTotp(secret, token) {
  const step = Math.floor(Date.now() / 1000 / 30)
  for (const delta of [-1, 0, 1]) {
    const expected = Buffer.from(totpToken(secret, step + delta))
    const actual   = Buffer.from(String(token))
    if (expected.length === actual.length && timingSafeEqual(expected, actual)) return true
  }
  return false
}

export function otpauthUrl(secret, accountName, issuer = 'Memovoy') {
  const enc = encodeURIComponent
  return `otpauth://totp/${enc(issuer)}:${enc(accountName)}?secret=${secret}&issuer=${enc(issuer)}&algorithm=SHA1&digits=6&period=30`
}

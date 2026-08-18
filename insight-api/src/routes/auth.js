import bcrypt from 'bcrypt'
import * as argon2 from 'argon2'
import jwt from 'jsonwebtoken'
import crypto from 'crypto'
import { z } from 'zod'
import QRCode from 'qrcode'
import { query } from '../db/pool.js'
import { sendVerificationEmail, sendPasswordResetEmail } from '../services/email.js'
import { logAudit } from '../services/audit.js'
import { generateTotpSecret, verifyTotp, otpauthUrl } from '../services/totp.js'

const SALT_ROUNDS   = 12

// Argon2id options — OWASP recommended minimum
const ARGON2_OPTIONS = { type: argon2.argon2id, memoryCost: 65536, timeCost: 3, parallelism: 1 }

/**
 * Hash a password using Argon2id (new registrations) or bcrypt (legacy).
 * Returns the hash string.
 */
async function hashPassword(password) {
  return argon2.hash(password, ARGON2_OPTIONS)
}

/**
 * Verify a password. Detects hash algorithm by prefix:
 * - '$argon2id$...' → argon2id verify
 * - '$2b$...' / '$2a$...' → bcrypt verify
 * Returns { valid: boolean, needsRehash: boolean }
 */
async function verifyPassword(password, storedHash) {
  if (storedHash.startsWith('$argon2')) {
    const valid = await argon2.verify(storedHash, password)
    const needsRehash = valid && argon2.needsRehash(storedHash, ARGON2_OPTIONS)
    return { valid, needsRehash }
  }
  // Legacy bcrypt path
  const valid = await bcrypt.compare(password, storedHash)
  return { valid, needsRehash: valid } // always migrate on successful bcrypt login
}
const ACCESS_TTL    = '15m'
const REFRESH_TTL   = '7d'
const REFRESH_MS    = 7 * 24 * 60 * 60 * 1000
const MAX_ATTEMPTS  = 5
const LOCKOUT_MIN   = 15
// Pre-computed hash used when the email is not found — ensures bcrypt always
// runs so response time is indistinguishable between "wrong email" and "wrong password".
const DUMMY_HASH    = bcrypt.hashSync('__never_used__', 12)

function makeTokens(userId, username) {
  const payload = { id: userId, username }
  const jti          = crypto.randomUUID()
  const accessToken  = jwt.sign(payload, process.env.JWT_SECRET,         { algorithm: 'HS256', expiresIn: ACCESS_TTL })
  const refreshToken = jwt.sign({ ...payload, jti }, process.env.JWT_REFRESH_SECRET, { algorithm: 'HS256', expiresIn: REFRESH_TTL })
  return { accessToken, refreshToken, jti }
}

function recordSession(userId, jti, request) {
  const ua        = request.headers['user-agent'] ?? null
  const ip        = request.ip ?? null
  const expiresAt = new Date(Date.now() + REFRESH_MS)
  query(
    `INSERT INTO device_sessions (user_id, jti, device_name, ip_address, user_agent, expires_at)
     VALUES ($1, $2, $3, $4::inet, $5, $6)
     ON CONFLICT (jti) DO UPDATE SET last_seen_at = NOW()`,
    [userId, jti, ua?.slice(0, 200) ?? null, ip, ua, expiresAt],
  ).catch(() => {})
}

function setRefreshCookie(reply, token) {
  reply.setCookie('refreshToken', token, {
    httpOnly: true,
    sameSite: 'strict',
    secure:   process.env.NODE_ENV === 'production',
    maxAge:   REFRESH_MS / 1000,
    path:     '/auth',
  })
}

function userDto(row) {
  return {
    id:                  row.id,
    username:            row.username,
    email:               row.email,
    displayName:         row.display_name ?? row.username,
    avatarUrl:           row.avatar_url,
    coverUrl:            row.cover_url ?? null,
    bio:                 row.bio,
    location:            row.location ?? null,
    website:             row.website ?? null,
    isPrivate:           row.is_private,
    isVerified:          row.is_verified,
    score:               Number(row.score ?? 0),
    emailVerified:       row.email_verified ?? false,
    onboardingCompleted: row.onboarding_completed ?? false,
  }
}

function getClientIp(request) {
  return request.ip ?? null
}

// Password must have ≥8 chars, 1 uppercase, 1 digit
const PASSWORD_REGEX = /^(?=.*[A-Z])(?=.*\d).{8,}$/

const registerSchema = z.object({
  username: z.string().min(3).max(30).regex(/^[a-z0-9_]+$/, 'Apenas letras minúsculas, números e _.'),
  email:    z.string().email(),
  password: z.string()
    .min(8,   'Password deve ter pelo menos 8 caracteres.')
    .max(128)
    .regex(PASSWORD_REGEX, 'Password deve conter pelo menos 1 letra maiúscula e 1 número.'),
})

const loginSchema = z.object({
  email:    z.string().email(),
  password: z.string().min(1),
})

export async function authRoutes(app) {
  // POST /auth/register
  app.post('/register', { config: { rateLimit: { max: 5, timeWindow: '1 minute' } } }, async (request, reply) => {
    const parsed = registerSchema.safeParse(request.body)
    if (!parsed.success) {
      return reply.status(400).send({ message: parsed.error.errors[0].message })
    }

    const { username, email, password } = parsed.data

    // Hash first (Argon2id) so both duplicate and success paths take the same time
    const passwordHash = await hashPassword(password)

    const existing = await query(
      'SELECT id FROM users WHERE lower(email) = lower($1) OR lower(username) = lower($2)',
      [email, username],
    )
    if (existing.rows.length > 0) {
      return reply.send({ message: 'Se o email e o username estiverem disponíveis, receberás um email de confirmação em breve.' })
    }
    const verificationToken   = crypto.randomBytes(32).toString('hex')
    const verificationExpires = new Date(Date.now() + 24 * 60 * 60 * 1000)

    const { rows } = await query(
      `INSERT INTO users
         (username, email, password_hash, display_name,
          email_verified, verification_token, verification_token_expires)
       VALUES ($1, $2, $3, $1, FALSE, $4, $5)
       RETURNING *`,
      [username, email.toLowerCase(), passwordHash, verificationToken, verificationExpires],
    )

    const user = rows[0]

    sendVerificationEmail(user.email, verificationToken).catch(() => {})

    const { accessToken, refreshToken, jti } = makeTokens(user.id, user.username)
    setRefreshCookie(reply, refreshToken)
    recordSession(user.id, jti, request)

    reply.send({ user: userDto(user), accessToken })
  })

  // POST /auth/login
  app.post('/login', { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }, async (request, reply) => {
    const parsed = loginSchema.safeParse(request.body)
    if (!parsed.success) {
      return reply.status(400).send({ message: 'Dados inválidos.' })
    }

    const { email, password } = parsed.data
    const ip = getClientIp(request)

    const { rows } = await query(
      'SELECT * FROM users WHERE lower(email) = lower($1)',
      [email],
    )
    const user = rows[0]

    // Short-circuit for locked accounts before running bcrypt
    if (user?.locked_until && new Date(user.locked_until) > new Date()) {
      const remaining = Math.ceil((new Date(user.locked_until) - Date.now()) / 60000)
      return reply.status(429).send({
        message: `Conta bloqueada por excesso de tentativas. Tenta novamente em ${remaining} minuto(s).`,
      })
    }

    // Always verify a hash — prevents timing-based email enumeration.
    // When the user does not exist, DUMMY_HASH ensures a ~100ms delay.
    const hashToCompare = user ? user.password_hash : DUMMY_HASH
    const { valid: match, needsRehash } = await verifyPassword(password, hashToCompare)

    if (!user || !match) {
      if (user) {
        const attempts = (user.failed_login_attempts ?? 0) + 1
        if (attempts >= MAX_ATTEMPTS) {
          const lockedUntil = new Date(Date.now() + LOCKOUT_MIN * 60 * 1000)
          await query(
            'UPDATE users SET failed_login_attempts = $1, locked_until = $2 WHERE id = $3',
            [attempts, lockedUntil, user.id],
          )
          logAudit(user.id, 'account_locked', { attempts, ip }, ip)
          return reply.status(429).send({
            message: `Conta bloqueada por ${LOCKOUT_MIN} minutos após ${MAX_ATTEMPTS} tentativas falhadas.`,
          })
        }
        await query(
          'UPDATE users SET failed_login_attempts = $1 WHERE id = $2',
          [attempts, user.id],
        )
      }
      return reply.status(401).send({ message: 'Credenciais incorretas.' })
    }

    // Reset failed attempts on successful login
    await query(
      'UPDATE users SET failed_login_attempts = 0, locked_until = NULL WHERE id = $1',
      [user.id],
    )

    // Lazy argon2id migration: if the stored hash was bcrypt, rehash with argon2id now
    if (needsRehash) {
      hashPassword(password).then((newHash) =>
        query('UPDATE users SET password_hash = $1 WHERE id = $2', [newHash, user.id]).catch(() => {}),
      ).catch(() => {})
    }

    // If 2FA is enabled, issue a short-lived temp token instead of full session
    if (user.totp_enabled) {
      const tempToken = jwt.sign(
        { id: user.id, scope: '2fa-pending' },
        process.env.JWT_SECRET,
        { algorithm: 'HS256', expiresIn: '5m' },
      )
      return reply.send({ requires2fa: true, tempToken })
    }

    const { accessToken, refreshToken: rt2, jti: jti2 } = makeTokens(user.id, user.username)
    setRefreshCookie(reply, rt2)
    recordSession(user.id, jti2, request)

    reply.send({ user: userDto(user), accessToken })
  })

  // POST /auth/2fa/authenticate — exchange tempToken + TOTP code for a real session
  app.post('/2fa/authenticate', { config: { rateLimit: { max: 10, timeWindow: '5 minutes' } } }, async (request, reply) => {
    const schema = z.object({
      tempToken: z.string(),
      code:      z.string().length(6).regex(/^\d{6}$/),
    })
    const parsed = schema.safeParse(request.body)
    if (!parsed.success) return reply.status(400).send({ message: 'Dados inválidos.' })

    let payload
    try {
      payload = jwt.verify(parsed.data.tempToken, process.env.JWT_SECRET, { algorithms: ['HS256'] })
    } catch {
      return reply.status(401).send({ message: 'Token inválido ou expirado.' })
    }
    if (payload.scope !== '2fa-pending') return reply.status(401).send({ message: 'Token inválido.' })

    const { rows } = await query('SELECT * FROM users WHERE id = $1', [payload.id])
    const user = rows[0]
    if (!user || !user.totp_enabled || !user.totp_secret) {
      return reply.status(400).send({ message: '2FA não está activo.' })
    }
    if (!verifyTotp(user.totp_secret, parsed.data.code)) {
      return reply.status(401).send({ message: 'Código inválido.' })
    }

    const { accessToken, refreshToken: rt2fa, jti: jti2fa } = makeTokens(user.id, user.username)
    setRefreshCookie(reply, rt2fa)
    recordSession(user.id, jti2fa, request)
    reply.send({ user: userDto(user), accessToken })
  })

  // POST /auth/2fa/setup — generate a new TOTP secret (not yet active)
  app.post('/2fa/setup', { preHandler: [app.authenticate] }, async (request, reply) => {
    const { rows } = await query('SELECT email FROM users WHERE id = $1', [request.user.id])
    if (rows.length === 0) return reply.status(404).send({ message: 'Utilizador não encontrado.' })

    const secret = generateTotpSecret()
    // Store as pending (totp_enabled stays false until confirmed)
    await query('UPDATE users SET totp_secret = $1, totp_enabled = FALSE WHERE id = $2', [secret, request.user.id])

    const uri = otpauthUrl(secret, rows[0].email)
    const qrCodeDataUrl = await QRCode.toDataURL(uri, { width: 200, margin: 1 })

    reply.send({ secret, qrCodeDataUrl })
  })

  // POST /auth/2fa/confirm — verify first TOTP code and activate 2FA
  app.post('/2fa/confirm', { preHandler: [app.authenticate] }, async (request, reply) => {
    const schema = z.object({ code: z.string().length(6).regex(/^\d{6}$/) })
    const parsed = schema.safeParse(request.body)
    if (!parsed.success) return reply.status(400).send({ message: 'Código inválido.' })

    const { rows } = await query('SELECT totp_secret, totp_enabled FROM users WHERE id = $1', [request.user.id])
    if (!rows[0]?.totp_secret) return reply.status(400).send({ message: 'Inicia a configuração 2FA primeiro.' })
    if (rows[0].totp_enabled) return reply.status(400).send({ message: '2FA já está activo.' })

    if (!verifyTotp(rows[0].totp_secret, parsed.data.code)) {
      return reply.status(400).send({ message: 'Código inválido. Tenta novamente.' })
    }

    await query('UPDATE users SET totp_enabled = TRUE WHERE id = $1', [request.user.id])
    reply.send({ ok: true })
  })

  // DELETE /auth/2fa — disable 2FA (requires valid TOTP code or current password)
  app.delete('/2fa', { preHandler: [app.authenticate] }, async (request, reply) => {
    const schema = z.object({ code: z.string().length(6).regex(/^\d{6}$/) })
    const parsed = schema.safeParse(request.body)
    if (!parsed.success) return reply.status(400).send({ message: 'Código inválido.' })

    const { rows } = await query('SELECT totp_secret, totp_enabled FROM users WHERE id = $1', [request.user.id])
    if (!rows[0]?.totp_enabled) return reply.status(400).send({ message: '2FA não está activo.' })

    if (!verifyTotp(rows[0].totp_secret, parsed.data.code)) {
      return reply.status(400).send({ message: 'Código inválido.' })
    }

    await query('UPDATE users SET totp_secret = NULL, totp_enabled = FALSE WHERE id = $1', [request.user.id])
    reply.send({ ok: true })
  })

  // GET /auth/verify-email?token=xxx
  app.get('/verify-email', async (request, reply) => {
    const { token } = request.query
    if (!token) return reply.status(400).send({ message: 'Token em falta.' })

    const { rows } = await query(
      `SELECT id FROM users
       WHERE verification_token = $1
         AND verification_token_expires > NOW()
         AND email_verified = FALSE`,
      [token],
    )

    if (rows.length === 0) {
      return reply.status(400).send({ message: 'Token inválido ou expirado.' })
    }

    await query(
      `UPDATE users
       SET email_verified = TRUE, verification_token = NULL, verification_token_expires = NULL
       WHERE id = $1`,
      [rows[0].id],
    )

    reply.send({ ok: true })
  })

  // POST /auth/resend-verification
  app.post('/resend-verification', { preHandler: [app.authenticate] }, async (request, reply) => {
    const { rows } = await query(
      'SELECT email, email_verified FROM users WHERE id = $1',
      [request.user.id],
    )
    if (rows.length === 0) return reply.status(404).send({ message: 'Utilizador não encontrado.' })
    if (rows[0].email_verified) return reply.status(400).send({ message: 'Email já verificado.' })

    const token   = crypto.randomBytes(32).toString('hex')
    const expires = new Date(Date.now() + 24 * 60 * 60 * 1000)

    await query(
      'UPDATE users SET verification_token = $1, verification_token_expires = $2 WHERE id = $3',
      [token, expires, request.user.id],
    )

    sendVerificationEmail(rows[0].email, token).catch(() => {})
    reply.send({ ok: true })
  })

  // POST /auth/refresh
  app.post('/refresh', async (request, reply) => {
    const token = request.cookies?.refreshToken
    if (!token) return reply.status(401).send({ message: 'Sessão expirada.' })

    let payload
    try {
      payload = jwt.verify(token, process.env.JWT_REFRESH_SECRET, { algorithms: ['HS256'] })
    } catch {
      return reply.status(401).send({ message: 'Sessão inválida.' })
    }

    // Reject legacy tokens without jti (not revocable)
    if (!payload.jti) {
      return reply.status(401).send({ message: 'Sessão inválida.' })
    }

    // Check if this refresh token has been revoked
    const { rows: revoked } = await query(
      'SELECT 1 FROM revoked_tokens WHERE jti = $1',
      [payload.jti],
    )
    if (revoked.length > 0) return reply.status(401).send({ message: 'Sessão revogada.' })

    const { rows } = await query('SELECT * FROM users WHERE id = $1', [payload.id])
    const user = rows[0]
    if (!user) return reply.status(401).send({ message: 'Utilizador não encontrado.' })

    // Revoke the used refresh token immediately (rotation — one-time use)
    const expiresAt = new Date(payload.exp * 1000)
    await query(
      'INSERT INTO revoked_tokens (jti, expires_at) VALUES ($1, $2) ON CONFLICT DO NOTHING',
      [payload.jti, expiresAt],
    )
    // Remove the old session record
    query('DELETE FROM device_sessions WHERE jti = $1', [payload.jti]).catch(() => {})

    const { accessToken, refreshToken, jti: newJti } = makeTokens(user.id, user.username)
    setRefreshCookie(reply, refreshToken)
    recordSession(user.id, newJti, request)

    reply.send({ user: userDto(user), accessToken })
  })

  // POST /auth/change-password
  app.post('/change-password', { preHandler: [app.authenticate] }, async (request, reply) => {
    const schema = z.object({
      currentPassword: z.string().min(1),
      newPassword:     z.string()
        .min(8, 'Nova password deve ter pelo menos 8 caracteres.')
        .max(128)
        .regex(PASSWORD_REGEX, 'Nova password deve conter pelo menos 1 letra maiúscula e 1 número.'),
    })

    const parsed = schema.safeParse(request.body)
    if (!parsed.success) return reply.status(400).send({ message: parsed.error.errors[0].message })

    const { currentPassword, newPassword } = parsed.data

    const { rows } = await query('SELECT password_hash FROM users WHERE id = $1', [request.user.id])
    if (rows.length === 0) return reply.status(404).send({ message: 'Utilizador não encontrado.' })

    const { valid: match } = await verifyPassword(currentPassword, rows[0].password_hash)
    if (!match) return reply.status(401).send({ message: 'Password actual incorreta.' })

    const newHash = await hashPassword(newPassword)
    await query('UPDATE users SET password_hash = $1 WHERE id = $2', [newHash, request.user.id])

    logAudit(request.user.id, 'password_change', {}, getClientIp(request))

    reply.send({ ok: true })
  })

  // POST /auth/complete-onboarding
  app.post('/complete-onboarding', { preHandler: [app.authenticate] }, async (request, reply) => {
    await query('UPDATE users SET onboarding_completed = TRUE WHERE id = $1', [request.user.id])
    reply.send({ ok: true })
  })

  // POST /auth/logout — revoke refresh token
  app.post('/logout', async (request, reply) => {
    const token = request.cookies?.refreshToken
    if (token) {
      try {
        const payload = jwt.verify(token, process.env.JWT_REFRESH_SECRET, { algorithms: ['HS256'] })
        if (payload.jti) {
          const expiresAt = new Date(payload.exp * 1000)
          await query(
            'INSERT INTO revoked_tokens (jti, expires_at) VALUES ($1, $2) ON CONFLICT DO NOTHING',
            [payload.jti, expiresAt],
          )
        }
      } catch { /* token invalid — nothing to revoke */ }
    }
    reply.clearCookie('refreshToken', { path: '/auth' })
    reply.send({ ok: true })
  })

  // POST /auth/forgot-password
  app.post('/forgot-password', { config: { rateLimit: { max: 5, timeWindow: '15 minutes' } } }, async (request, reply) => {
    const schema = z.object({ email: z.string().email() })
    const parsed = schema.safeParse(request.body)
    if (!parsed.success) return reply.status(400).send({ message: 'Email inválido.' })

    const { rows } = await query(
      'SELECT id, email FROM users WHERE lower(email) = lower($1)',
      [parsed.data.email],
    )

    // Always respond 200 to avoid user enumeration
    if (rows.length === 0) return reply.send({ ok: true })

    const user  = rows[0]
    const token = crypto.randomBytes(32).toString('hex')
    const exp   = new Date(Date.now() + 60 * 60 * 1000) // 1 hour

    await query(
      'UPDATE users SET reset_token = $1, reset_token_expires = $2 WHERE id = $3',
      [token, exp, user.id],
    )

    sendPasswordResetEmail(user.email, token).catch(() => {})
    reply.send({ ok: true })
  })

  // POST /auth/reset-password
  app.post('/reset-password', { config: { rateLimit: { max: 10, timeWindow: '15 minutes' } } }, async (request, reply) => {
    const schema = z.object({
      token:    z.string().min(64).max(64),
      password: z.string()
        .min(8,   'Password deve ter pelo menos 8 caracteres.')
        .max(128)
        .regex(PASSWORD_REGEX, 'Password deve conter pelo menos 1 letra maiúscula e 1 número.'),
    })
    const parsed = schema.safeParse(request.body)
    if (!parsed.success) return reply.status(400).send({ message: parsed.error.errors[0].message })

    const { rows } = await query(
      `SELECT id FROM users
       WHERE reset_token = $1 AND reset_token_expires > NOW()`,
      [parsed.data.token],
    )
    if (rows.length === 0) return reply.status(400).send({ message: 'Link inválido ou expirado.' })

    const hash = await hashPassword(parsed.data.password)
    await query(
      `UPDATE users
       SET password_hash = $1, reset_token = NULL, reset_token_expires = NULL,
           failed_login_attempts = 0, locked_until = NULL
       WHERE id = $2`,
      [hash, rows[0].id],
    )

    reply.send({ ok: true })
  })
}

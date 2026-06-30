// src/auth/auth.service.js
import crypto from 'node:crypto'
import argon2 from 'argon2'
import { config } from '../config/index.js'
import { ConflictError, UnauthorizedError, ValidationError } from '../shared/errors/index.js'

// ---------------------------------------------------------------------------
// Email helpers
// ---------------------------------------------------------------------------

export function encryptEmail(email) {
  const key = Buffer.from(config.crypto.emailKey, 'base64')
  const iv  = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv)
  const encrypted = Buffer.concat([cipher.update(email.toLowerCase(), 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return Buffer.concat([iv, tag, encrypted]).toString('base64')
}

export function hashEmail(email) {
  return crypto.createHash('sha256').update(email.toLowerCase().trim()).digest('hex')
}

// Argon2id dummy hash — pré-computado, usado para manter timing constante
// quando o utilizador não existe, evitando timing attacks.
const DUMMY_HASH = '$argon2id$v=19$m=65536,t=3,p=4$AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'

// ---------------------------------------------------------------------------
// AuthService
// ---------------------------------------------------------------------------

export class AuthService {
  constructor(db, jwtPlugin) {
    this.db  = db
    this.jwt = jwtPlugin
  }

  // -----------------------------------------------------------------------
  // register
  // FIX #1 + #2: a sessão é criada dentro da transacção para que o seu id
  // seja incluído no payload do token no momento da geração.
  // FIX #3: não faz verificações de unicidade pré-INSERT — confia nos
  // constraints UNIQUE da BD e converte erro 23505 em ConflictError.
  // -----------------------------------------------------------------------
  async register({ email, password, username, countryCode, language }) {
    const emailHash      = hashEmail(email)
    const emailEncrypted = encryptEmail(email)

    const passwordHash = await argon2.hash(password, {
      type:         argon2.argon2id,
      memoryCost:   65536,
      timeCost:     3,
      parallelism:  4,
    })

    const dbRegion = this._dbRegionForCountry(countryCode)

    const { user, session } = await this.db.transaction(async (tx) => {
      let newUser
      try {
        ;[newUser] = await tx`
          INSERT INTO users (
            email_encrypted, email_hash, username,
            password_hash, auth_provider, db_region,
            country_code, language, role, is_verified, gdpr_consent_at
          ) VALUES (
            ${emailEncrypted}, ${emailHash}, ${username.toLowerCase()},
            ${passwordHash}, 'email', ${dbRegion},
            ${countryCode?.toUpperCase() ?? null}, ${language ?? 'pt-PT'},
            'user', false, NOW()
          )
          RETURNING id, username, role, db_region, created_at
        `
      } catch (err) {
        // FIX #3: capturar violação UNIQUE em vez de verificar antes
        if (err.code === '23505') {
          if (err.constraint_name?.includes('email_hash')) {
            throw new ConflictError('Este email já está registado')
          }
          if (err.constraint_name?.includes('username')) {
            throw new ConflictError('Este username já está em uso')
          }
          throw new ConflictError('Dados em conflito')
        }
        throw err
      }

      await tx`INSERT INTO user_profiles (user_id, display_name) VALUES (${newUser.id}, ${username})`
      await tx`INSERT INTO user_preferences (user_id) VALUES (${newUser.id})`
      await tx`INSERT INTO streaks (user_id) VALUES (${newUser.id})`

      // FIX #1 + #2: criar sessão dentro da transacção para obter o id
      // antes de gerar os tokens — assim sessionId fica no payload do JWT.
      const [newSession] = await tx`
        INSERT INTO user_sessions (user_id, expires_at)
        VALUES (${newUser.id}, NOW() + INTERVAL '30 days')
        RETURNING id
      `

      return { user: newUser, session: newSession }
    })

    const tokens = this._generateTokens(user, session.id)
    return { user, ...tokens }
  }

  // -----------------------------------------------------------------------
  // login
  // -----------------------------------------------------------------------
  async login({ email, password, deviceFingerprint, ipCountry }) {
    const { sql } = this.db
    const emailHash = hashEmail(email)

    const [user] = await sql`
      SELECT id, username, role, db_region, password_hash,
             is_verified, mfa_enabled, deleted_at
      FROM users
      WHERE email_hash = ${emailHash}
      LIMIT 1
    `

    // Timing-safe: verificar password mesmo quando utilizador não existe
    const hashToVerify = (user && !user.deleted_at) ? user.password_hash : DUMMY_HASH
    const valid = await argon2.verify(hashToVerify, password).catch(() => false)

    if (!user || user.deleted_at || !valid) {
      throw new UnauthorizedError('Credenciais inválidas')
    }

    const isSuspicious = await this._checkSuspicious(user.id, ipCountry)

    const [session] = await sql`
      INSERT INTO user_sessions (
        user_id, device_fingerprint, ip_country, is_suspicious, expires_at
      ) VALUES (
        ${user.id}, ${deviceFingerprint ?? null}, ${ipCountry ?? null},
        ${isSuspicious}, NOW() + INTERVAL '30 days'
      )
      RETURNING id
    `

    // Notificação de sessão suspeita — fire-and-forget, não bloqueia login
    if (isSuspicious) {
      sql`
        INSERT INTO notifications (user_id, type, title, channel, status)
        VALUES (${user.id}, 'session_suspicious',
                'Novo login detectado de localização diferente', 'push', 'pending')
      `.catch((err) => {
        // Log mas não propagar — o login deve concluir mesmo que a notificação falhe
        console.error({ err, userId: user.id }, 'Falha ao criar notificação de sessão suspeita')
      })
    }

    const tokens = this._generateTokens(user, session.id)
    return {
      user: { id: user.id, username: user.username, role: user.role,
              isVerified: user.is_verified, isSuspicious },
      ...tokens,
    }
  }

  // -----------------------------------------------------------------------
  // refresh
  // -----------------------------------------------------------------------
  async refresh(refreshToken) {
    let payload
    try {
      payload = this.jwt.verify(refreshToken, { key: config.jwt.refreshSecret })
    } catch {
      throw new UnauthorizedError('Refresh token inválido ou expirado')
    }

    // Sessão sem sessionId no payload = token gerado antes do fix — inválido
    if (!payload.sessionId) {
      throw new UnauthorizedError('Refresh token inválido — faz login novamente')
    }

    const { sql } = this.db
    const [session] = await sql`
      SELECT us.id, us.user_id, u.role, u.db_region, u.deleted_at
      FROM user_sessions us
      JOIN users u ON u.id = us.user_id
      WHERE us.id       = ${payload.sessionId}
        AND us.revoked_at IS NULL
        AND us.expires_at > NOW()
      LIMIT 1
    `

    if (!session || session.deleted_at) {
      throw new UnauthorizedError('Sessão inválida ou expirada')
    }

    const accessToken = this.jwt.sign(
      { sub: session.user_id, role: session.role,
        dbRegion: session.db_region, sessionId: session.id },
      { key: config.jwt.accessSecret, expiresIn: config.jwt.accessTtl }
    )

    return { accessToken }
  }

  // -----------------------------------------------------------------------
  // logout
  // -----------------------------------------------------------------------
  async logout(sessionId, userId) {
    if (!sessionId) return // nada a revogar
    const { sql } = this.db
    await sql`
      UPDATE user_sessions SET revoked_at = NOW()
      WHERE id = ${sessionId} AND user_id = ${userId} AND revoked_at IS NULL
    `
  }

  // -----------------------------------------------------------------------
  // revokeOtherSessions
  // -----------------------------------------------------------------------
  async revokeOtherSessions(currentSessionId, userId) {
    const { sql } = this.db
    const result = await sql`
      UPDATE user_sessions SET revoked_at = NOW()
      WHERE user_id = ${userId}
        AND id != ${currentSessionId}
        AND revoked_at IS NULL
      RETURNING id
    `
    return result.length
  }

  // -----------------------------------------------------------------------
  // Private helpers
  // -----------------------------------------------------------------------

  _generateTokens(user, sessionId) {
    const base = { sub: user.id, role: user.role, dbRegion: user.db_region, sessionId }

    const accessToken = this.jwt.sign(base,
      { key: config.jwt.accessSecret, expiresIn: config.jwt.accessTtl })

    const refreshToken = this.jwt.sign({ ...base, type: 'refresh' },
      { key: config.jwt.refreshSecret, expiresIn: config.jwt.refreshTtl })

    return { accessToken, refreshToken }
  }

  _dbRegionForCountry(countryCode) {
    const euCountries = new Set(['PT','ES','FR','DE','IT','NL','BE','PL',
                                  'SE','NO','DK','FI','AT','CH','IE','RO',
                                  'GR','CZ','HU','SK','HR','SI','LT','LV','EE'])
    return euCountries.has(countryCode?.toUpperCase()) ? 'eu-central-1' : 'sa-east-1'
  }

  async _checkSuspicious(userId, ipCountry) {
    if (!ipCountry) return false
    const { sql } = this.db
    const [last] = await sql`
      SELECT ip_country FROM user_sessions
      WHERE user_id = ${userId} AND revoked_at IS NULL AND ip_country IS NOT NULL
      ORDER BY created_at DESC LIMIT 1
    `
    return !!last && last.ip_country !== ipCountry
  }
}

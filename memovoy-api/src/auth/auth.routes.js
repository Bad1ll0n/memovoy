// src/auth/auth.routes.js
// Rotas de autenticação. Prefixo: /auth

import { z } from 'zod'
import { AuthService } from './auth.service.js'
import { authenticate } from '../middleware/auth.js'
import { ValidationError } from '../shared/errors/index.js'

// Schemas de validação com Zod
const registerSchema = z.object({
  email: z.string().email('Email inválido').max(254),
  password: z
    .string()
    .min(8, 'Password deve ter pelo menos 8 caracteres')
    .max(128)
    .regex(
      /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/,
      'Password deve conter maiúsculas, minúsculas e números'
    ),
  username: z
    .string()
    .min(3, 'Username deve ter pelo menos 3 caracteres')
    .max(30)
    .regex(/^[a-z0-9_]+$/, 'Username só pode ter letras minúsculas, números e _'),
  countryCode: z.string().length(2).toUpperCase().optional(),
  language: z.string().max(10).optional(),
})

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
})

export default async function authRoutes(fastify) {
  const authService = new AuthService(fastify.db, fastify.jwt)

  // -------------------------------------------------------
  // POST /auth/register
  // -------------------------------------------------------
  fastify.post('/register', {
    config: { rateLimit: { max: 5, timeWindow: '1 minute' } },
  }, async (request, reply) => {
    const result = registerSchema.safeParse(request.body)
    if (!result.success) {
      throw new ValidationError('Dados inválidos', result.error.flatten())
    }

    const { user, accessToken, refreshToken } = await authService.register(result.data)

    // Refresh token em httpOnly cookie (não acessível via JS)
    reply.setCookie('refresh_token', refreshToken, {
      httpOnly: true,
      secure: !fastify.config.isDev,
      sameSite: 'strict',
      path: '/auth/refresh',
      maxAge: 60 * 60 * 24 * 30, // 30 dias
    })

    return reply.status(201).send({
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
      },
      accessToken,
    })
  })

  // -------------------------------------------------------
  // POST /auth/login
  // -------------------------------------------------------
  fastify.post('/login', {
    config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
  }, async (request, reply) => {
    const result = loginSchema.safeParse(request.body)
    if (!result.success) {
      throw new ValidationError('Dados inválidos', result.error.flatten())
    }

    // Extrair IP e device fingerprint dos headers
    const ipCountry = request.headers['cf-ipcountry'] ?? null
    const deviceFingerprint = request.headers['x-device-fingerprint'] ?? null

    const { user, accessToken, refreshToken } = await authService.login({
      ...result.data,
      deviceFingerprint,
      ipCountry,
    })

    reply.setCookie('refresh_token', refreshToken, {
      httpOnly: true,
      secure: !fastify.config.isDev,
      sameSite: 'strict',
      path: '/auth/refresh',
      maxAge: 60 * 60 * 24 * 30,
    })

    return reply.send({ user, accessToken })
  })

  // -------------------------------------------------------
  // POST /auth/refresh — renovar access token
  // -------------------------------------------------------
  fastify.post('/refresh', async (request, reply) => {
    const refreshToken = request.cookies?.refresh_token
    if (!refreshToken) {
      return reply.status(401).send({
        error: { code: 'NO_REFRESH_TOKEN', message: 'Refresh token em falta' },
      })
    }

    const { accessToken } = await authService.refresh(refreshToken)
    return reply.send({ accessToken })
  })

  // -------------------------------------------------------
  // POST /auth/logout
  // -------------------------------------------------------
  fastify.post('/logout', {
    preHandler: [authenticate],
  }, async (request, reply) => {
    const { sub: userId, sessionId } = request.user

    if (sessionId) {
      await authService.logout(sessionId, userId)
    }

    // Limpar cookie
    reply.clearCookie('refresh_token', { path: '/auth/refresh' })
    return reply.send({ ok: true })
  })

  // -------------------------------------------------------
  // GET /auth/sessions — listar sessões activas
  // -------------------------------------------------------
  fastify.get('/sessions', {
    preHandler: [authenticate],
  }, async (request) => {
    const { sub: userId } = request.user

    const sessions = await fastify.db.withUser(userId, request.user.role, async (sql) => {
      return sql`
        SELECT
          us.id,
          us.created_at,
          us.expires_at,
          us.is_suspicious,
          us.ip_country,
          ud.device_name,
          ud.platform,
          ud.last_seen_at
        FROM user_sessions us
        LEFT JOIN user_devices ud
          ON ud.device_id = us.device_fingerprint
          AND ud.user_id = ${userId}
        WHERE us.user_id = ${userId}
          AND us.revoked_at IS NULL
          AND us.expires_at > NOW()
        ORDER BY us.created_at DESC
        LIMIT 20
      `
    })

    return { sessions }
  })

  // -------------------------------------------------------
  // DELETE /auth/sessions/:sessionId — revogar sessão específica
  // -------------------------------------------------------
  fastify.delete('/sessions/:sessionId', {
    preHandler: [authenticate],
  }, async (request, reply) => {
    const { sub: userId } = request.user
    const { sessionId } = request.params

    await authService.logout(sessionId, userId)
    return reply.send({ ok: true })
  })

  // -------------------------------------------------------
  // DELETE /auth/sessions — revogar todas as outras sessões
  // -------------------------------------------------------
  fastify.delete('/sessions', {
    preHandler: [authenticate],
  }, async (request) => {
    const { sub: userId, sessionId } = request.user
    const revoked = await authService.revokeOtherSessions(sessionId, userId)
    return { revokedCount: revoked }
  })
}

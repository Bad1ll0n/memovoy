// src/users/users.routes.js
// Rotas de perfil. Prefixo: /users

import { z } from 'zod'
import { authenticate, optionalAuth } from '../middleware/auth.js'
import { NotFoundError, ValidationError } from '../shared/errors/index.js'

const updateProfileSchema = z.object({
  displayName: z.string().min(1).max(60).optional(),
  bio: z.string().max(500).nullable().optional(),
  locationText: z.string().max(100).nullable().optional(),
})

const updatePreferencesSchema = z.object({
  travelStyles: z.array(z.string()).max(5).optional(),
  dreamDestinations: z.array(z.string()).max(10).optional(),
  dietaryRestrictions: z.array(z.string()).max(10).optional(),
  defaultGroupType: z.enum(['solo', 'couple', 'friends', 'family']).nullable().optional(),
  defaultTransport: z.array(z.string()).optional(),
  defaultBudget: z.number().int().positive().nullable().optional(),
  notificationPush: z.boolean().optional(),
  notificationGeo: z.boolean().optional(),
  notificationEmail: z.boolean().optional(),
  theme: z.enum(['system', 'light', 'dark', 'auto_time']).optional(),
})

export default async function usersRoutes(fastify) {

  // -------------------------------------------------------
  // GET /users/me — perfil do utilizador autenticado
  // -------------------------------------------------------
  fastify.get('/me', {
    preHandler: [authenticate],
  }, async (request) => {
    const { sub: userId, role } = request.user

    const result = await fastify.db.withUser(userId, role, async (sql) => {
      const [user] = await sql`
        SELECT
          u.id,
          u.username,
          u.role,
          u.is_verified,
          u.is_private,
          u.mfa_enabled,
          u.follower_count,
          u.created_at,
          up.display_name,
          up.bio,
          up.avatar_url,
          up.location_text,
          up.countries_visited,
          up.total_trips,
          up.total_countries,
          up.following_count,
          up.level,
          upr.travel_styles,
          upr.dream_destinations,
          upr.dietary_restrictions,
          upr.default_group_type,
          upr.default_transport,
          upr.default_budget,
          upr.notification_push,
          upr.notification_geo,
          upr.notification_email,
          upr.theme,
          s.current_streak,
          s.longest_streak
        FROM users u
        JOIN user_profiles up ON up.user_id = u.id
        LEFT JOIN user_preferences upr ON upr.user_id = u.id
        LEFT JOIN streaks s ON s.user_id = u.id
        WHERE u.id = ${userId}
          AND u.deleted_at IS NULL
      `
      return user
    })

    if (!result) throw new NotFoundError('Utilizador')

    return {
      user: {
        id: result.id,
        username: result.username,
        role: result.role,
        isVerified: result.is_verified,
        isPrivate: result.is_private,
        mfaEnabled: result.mfa_enabled,
        followerCount: result.follower_count,
        createdAt: result.created_at,
        profile: {
          displayName: result.display_name,
          bio: result.bio,
          avatarUrl: result.avatar_url,
          locationText: result.location_text,
          countriesVisited: result.countries_visited ?? [],
          totalTrips: result.total_trips,
          totalCountries: result.total_countries,
          followingCount: result.following_count,
          level: result.level,
        },
        preferences: {
          travelStyles: result.travel_styles ?? [],
          dreamDestinations: result.dream_destinations ?? [],
          dietaryRestrictions: result.dietary_restrictions ?? [],
          defaultGroupType: result.default_group_type,
          defaultTransport: result.default_transport ?? [],
          defaultBudget: result.default_budget,
          notifications: {
            push: result.notification_push,
            geo: result.notification_geo,
            email: result.notification_email,
          },
          theme: result.theme,
        },
        gamification: {
          currentStreak: result.current_streak ?? 0,
          longestStreak: result.longest_streak ?? 0,
        },
      },
    }
  })

  // -------------------------------------------------------
  // GET /users/:username — perfil público de qualquer utilizador
  // -------------------------------------------------------
  fastify.get('/:username', {
    preHandler: [optionalAuth],
  }, async (request) => {
    const { username } = request.params
    const viewerId = request.user?.sub ?? null

    const { sql } = fastify.db

    const [user] = await sql`
      SELECT
        u.id,
        u.username,
        u.is_verified,
        u.is_private,
        u.follower_count,
        u.created_at,
        up.display_name,
        up.bio,
        up.avatar_url,
        up.location_text,
        up.total_trips,
        up.total_countries,
        up.following_count,
        up.level,
        s.current_streak
      FROM users u
      JOIN user_profiles up ON up.user_id = u.id
      LEFT JOIN streaks s ON s.user_id = u.id
      WHERE u.username = ${username.toLowerCase()}
        AND u.deleted_at IS NULL
    `

    if (!user) throw new NotFoundError('Utilizador')

    // Verificar se o viewer segue este utilizador
    let isFollowing = false
    let isFollowPending = false
    if (viewerId && viewerId !== user.id) {
      const [follow] = await sql`
        SELECT status FROM follows
        WHERE follower_id = ${viewerId}
          AND following_id = ${user.id}
        LIMIT 1
      `
      isFollowing = follow?.status === 'active'
      isFollowPending = follow?.status === 'pending'
    }

    const isOwnProfile = viewerId === user.id
    const canSeeContent = !user.is_private || isFollowing || isOwnProfile

    return {
      user: {
        id: user.id,
        username: user.username,
        isVerified: user.is_verified,
        isPrivate: user.is_private,
        followerCount: user.follower_count,
        createdAt: user.created_at,
        profile: {
          displayName: user.display_name,
          bio: user.bio,
          avatarUrl: user.avatar_url,
          locationText: user.location_text,
          totalTrips: canSeeContent ? user.total_trips : null,
          totalCountries: canSeeContent ? user.total_countries : null,
          followingCount: canSeeContent ? user.following_count : null,
          level: user.level,
        },
        gamification: {
          currentStreak: canSeeContent ? (user.current_streak ?? 0) : null,
        },
        viewer: {
          isFollowing,
          isFollowPending,
          isOwnProfile,
          canSeeContent,
        },
      },
    }
  })

  // -------------------------------------------------------
  // PATCH /users/me — actualizar perfil
  // -------------------------------------------------------
  fastify.patch('/me', {
    preHandler: [authenticate],
  }, async (request) => {
    const { sub: userId, role } = request.user
    const result = updateProfileSchema.safeParse(request.body)
    if (!result.success) {
      throw new ValidationError('Dados inválidos', result.error.flatten())
    }

    const { displayName, bio, locationText } = result.data

    const updates = {}
    if (displayName !== undefined) updates.display_name = displayName
    if (bio !== undefined) updates.bio = bio
    if (locationText !== undefined) updates.location_text = locationText

    if (Object.keys(updates).length === 0) {
      return { ok: true, message: 'Sem alterações' }
    }

    await fastify.db.withUser(userId, role, async (sql) => {
      await sql`
        UPDATE user_profiles
        SET ${sql(updates)}, updated_at = NOW()
        WHERE user_id = ${userId}
      `
    })

    return { ok: true }
  })

  // -------------------------------------------------------
  // PATCH /users/me/preferences — actualizar preferências
  // -------------------------------------------------------
  fastify.patch('/me/preferences', {
    preHandler: [authenticate],
  }, async (request) => {
    const { sub: userId, role } = request.user
    const result = updatePreferencesSchema.safeParse(request.body)
    if (!result.success) {
      throw new ValidationError('Dados inválidos', result.error.flatten())
    }

    // Mapear camelCase para snake_case
    const fieldMap = {
      travelStyles: 'travel_styles',
      dreamDestinations: 'dream_destinations',
      dietaryRestrictions: 'dietary_restrictions',
      defaultGroupType: 'default_group_type',
      defaultTransport: 'default_transport',
      defaultBudget: 'default_budget',
      notificationPush: 'notification_push',
      notificationGeo: 'notification_geo',
      notificationEmail: 'notification_email',
      theme: 'theme',
    }

    const updates = {}
    for (const [camel, snake] of Object.entries(fieldMap)) {
      if (result.data[camel] !== undefined) {
        updates[snake] = result.data[camel]
      }
    }

    if (Object.keys(updates).length === 0) {
      return { ok: true, message: 'Sem alterações' }
    }

    await fastify.db.withUser(userId, role, async (sql) => {
      await sql`
        UPDATE user_preferences
        SET ${sql(updates)}, updated_at = NOW()
        WHERE user_id = ${userId}
      `
    })

    return { ok: true }
  })

  // -------------------------------------------------------
  // POST /users/:userId/follow — seguir utilizador
  // DELETE /users/:userId/follow — deixar de seguir
  // -------------------------------------------------------
  fastify.post('/:userId/follow', {
    preHandler: [authenticate],
  }, async (request, reply) => {
    const { sub: followerId, role } = request.user
    const { userId: followingId } = request.params

    if (followerId === followingId) {
      throw new ValidationError('Não podes seguir-te a ti próprio')
    }

    // Verificar se o alvo existe e é privado
    const { sql } = fastify.db
    const [target] = await sql`
      SELECT id, is_private FROM users
      WHERE id = ${followingId} AND deleted_at IS NULL
      LIMIT 1
    `
    if (!target) throw new NotFoundError('Utilizador')

    // Contas privadas → pedido pendente; públicas → activo imediatamente
    const status = target.is_private ? 'pending' : 'active'

    await fastify.db.withUser(followerId, role, async (tx) => {
      await tx`
        INSERT INTO follows (follower_id, following_id, status)
        VALUES (${followerId}, ${followingId}, ${status})
        ON CONFLICT (follower_id, following_id) DO NOTHING
      `
    })

    return reply.status(201).send({ status })
  })

  fastify.delete('/:userId/follow', {
    preHandler: [authenticate],
  }, async (request) => {
    const { sub: followerId, role } = request.user
    const { userId: followingId } = request.params

    await fastify.db.withUser(followerId, role, async (tx) => {
      await tx`
        DELETE FROM follows
        WHERE follower_id = ${followerId}
          AND following_id = ${followingId}
      `
    })

    return { ok: true }
  })
}

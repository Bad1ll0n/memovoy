// src/posts/posts.routes.js
// Prefixo: /posts

import { z } from 'zod'
import { PostsService } from './posts.service.js'
import { authenticate, optionalAuth } from '../middleware/auth.js'
import { ValidationError } from '../shared/errors/index.js'

const createPostSchema = z.object({
  itineraryId: z.string().uuid().optional(),
  caption: z.string().max(2200).optional(),
  locationName: z.string().max(120).optional(),
  locationLat: z.number().min(-90).max(90).optional(),
  locationLng: z.number().min(-180).max(180).optional(),
  countryCode: z.string().length(2).optional(),
  visibility: z.enum(['public', 'followers', 'private']).default('public'),
  media: z.array(z.object({
    url: z.string().url(),
    thumbnailUrl: z.string().url().optional(),
    mediaType: z.enum(['image', 'video']),
    width: z.number().int().positive().optional(),
    height: z.number().int().positive().optional(),
    aiDetectedLocation: z.string().max(200).optional(),
  })).max(10).default([]),
})

const addCommentSchema = z.object({
  content: z.string().min(1).max(1000),
  parentCommentId: z.string().uuid().optional(),
})

const reportSchema = z.object({
  category: z.enum(['inappropriate', 'spam', 'misinformation', 'privacy', 'hate', 'other']),
  note: z.string().max(500).optional(),
})

export default async function postsRoutes(fastify) {
  const svc = new PostsService(fastify.db)

  // -------------------------------------------------------
  // POST /posts — criar post
  // -------------------------------------------------------
  fastify.post('/', {
    preHandler: [authenticate],
    config: { rateLimit: { max: 30, timeWindow: '1 hour' } },
  }, async (request, reply) => {
    const parsed = createPostSchema.safeParse(request.body)
    if (!parsed.success) throw new ValidationError('Dados inválidos', parsed.error.flatten())

    const { sub: userId, role } = request.user
    const post = await svc.create(userId, role, parsed.data)
    return reply.status(201).send({ post })
  })

  // -------------------------------------------------------
  // GET /posts/:id — detalhe do post
  // -------------------------------------------------------
  fastify.get('/:id', {
    preHandler: [optionalAuth],
  }, async (request) => {
    const viewerId = request.user?.sub ?? null
    const post = await svc.findById(request.params.id, viewerId)
    return { post }
  })

  // -------------------------------------------------------
  // DELETE /posts/:id — eliminar post
  // -------------------------------------------------------
  fastify.delete('/:id', {
    preHandler: [authenticate],
  }, async (request, reply) => {
    const { sub: userId, role } = request.user
    await svc.delete(request.params.id, userId, role)
    return reply.status(204).send()
  })

  // -------------------------------------------------------
  // POST /posts/:id/like — toggle like
  // -------------------------------------------------------
  fastify.post('/:id/like', {
    preHandler: [authenticate],
  }, async (request) => {
    const { sub: userId, role } = request.user
    return svc.toggleLike(request.params.id, userId, role)
  })

  // -------------------------------------------------------
  // POST /posts/:id/comments — adicionar comentário
  // -------------------------------------------------------
  fastify.post('/:id/comments', {
    preHandler: [authenticate],
    config: { rateLimit: { max: 60, timeWindow: '1 hour' } },
  }, async (request, reply) => {
    const parsed = addCommentSchema.safeParse(request.body)
    if (!parsed.success) throw new ValidationError('Dados inválidos', parsed.error.flatten())

    const { sub: userId, role } = request.user
    const comment = await svc.addComment(
      request.params.id,
      userId,
      role,
      parsed.data
    )
    return reply.status(201).send({ comment })
  })

  // -------------------------------------------------------
  // GET /posts/comments/:commentId/replies — respostas
  // -------------------------------------------------------
  fastify.get('/comments/:commentId/replies', {
    preHandler: [optionalAuth],
  }, async (request) => {
    const viewerId = request.user?.sub ?? null
    const replies = await svc.getReplies(request.params.commentId, viewerId)
    return { replies }
  })

  // -------------------------------------------------------
  // POST /posts/:id/report — denunciar post
  // -------------------------------------------------------
  fastify.post('/:id/report', {
    preHandler: [authenticate],
    config: { rateLimit: { max: 20, timeWindow: '1 hour' } },
  }, async (request, reply) => {
    const parsed = reportSchema.safeParse(request.body)
    if (!parsed.success) throw new ValidationError('Dados inválidos', parsed.error.flatten())

    const { sub: userId, role } = request.user
    const report = await svc.report('post', request.params.id, userId, role, parsed.data)
    return reply.status(201).send({ report })
  })

  // -------------------------------------------------------
  // POST /posts/comments/:id/report — denunciar comentário
  // -------------------------------------------------------
  fastify.post('/comments/:id/report', {
    preHandler: [authenticate],
    config: { rateLimit: { max: 20, timeWindow: '1 hour' } },
  }, async (request, reply) => {
    const parsed = reportSchema.safeParse(request.body)
    if (!parsed.success) throw new ValidationError('Dados inválidos', parsed.error.flatten())

    const { sub: userId, role } = request.user
    const report = await svc.report('comment', request.params.id, userId, role, parsed.data)
    return reply.status(201).send({ report })
  })
}

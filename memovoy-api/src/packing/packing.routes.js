// src/packing/packing.routes.js
// Prefixo: /itineraries/:itineraryId/packing

import { z } from 'zod'
import { PackingService } from './packing.service.js'
import { authenticate }   from '../middleware/auth.js'
import { ValidationError } from '../shared/errors/index.js'

const toggleItemSchema = z.object({
  categoryName: z.string().min(1).max(60),
  itemName:     z.string().min(1).max(100),
  checked:      z.boolean(),
})

const addItemSchema = z.object({
  categoryName: z.string().min(1).max(60),
  item: z.object({
    item:     z.string().min(1).max(100),
    reason:   z.string().max(200).optional(),
    priority: z.enum(['essential','recommended','optional']).optional(),
  }),
})

const removeItemSchema = z.object({
  categoryName: z.string().min(1).max(60),
  itemName:     z.string().min(1).max(100),
})

export default async function packingRoutes(fastify) {
  const svc = new PackingService(fastify.db)

  // -----------------------------------------------------------------------
  // GET /itineraries/:itineraryId/packing — buscar packing list
  // -----------------------------------------------------------------------
  fastify.get('/', {
    preHandler: [authenticate],
  }, async (request) => {
    const { sub: userId }   = request.user
    const { itineraryId }   = request.params

    const list = await svc.get(itineraryId, userId)
    return { list }  // null se ainda não gerada
  })

  // -----------------------------------------------------------------------
  // POST /itineraries/:itineraryId/packing/generate — gerar/regenerar com IA
  // Rate limit: 3 gerações por hora por utilizador (custa tokens)
  // -----------------------------------------------------------------------
  fastify.post('/generate', {
    preHandler: [authenticate],
    config: {
      rateLimit: {
        max: 3,
        timeWindow: '1 hour',
        keyGenerator: req => `packing:${req.user.sub}`,
      },
    },
  }, async (request, reply) => {
    const { sub: userId, role } = request.user
    const { itineraryId }       = request.params

    const list = await svc.generate(itineraryId, userId, role)
    return reply.status(201).send({ list })
  })

  // -----------------------------------------------------------------------
  // PATCH /itineraries/:itineraryId/packing/toggle — marcar item
  // -----------------------------------------------------------------------
  fastify.patch('/toggle', {
    preHandler: [authenticate],
  }, async (request) => {
    const parsed = toggleItemSchema.safeParse(request.body)
    if (!parsed.success) throw new ValidationError('Dados inválidos', parsed.error.flatten())

    const { sub: userId, role } = request.user
    const { itineraryId }       = request.params

    return svc.toggleItem(itineraryId, userId, role, parsed.data)
  })

  // -----------------------------------------------------------------------
  // POST /itineraries/:itineraryId/packing/items — adicionar item manual
  // -----------------------------------------------------------------------
  fastify.post('/items', {
    preHandler: [authenticate],
  }, async (request, reply) => {
    const parsed = addItemSchema.safeParse(request.body)
    if (!parsed.success) throw new ValidationError('Dados inválidos', parsed.error.flatten())

    const { sub: userId, role } = request.user
    const { itineraryId }       = request.params

    const list = await svc.addItem(itineraryId, userId, role, parsed.data)
    return reply.status(201).send({ list })
  })

  // -----------------------------------------------------------------------
  // DELETE /itineraries/:itineraryId/packing/items — remover item
  // Body em DELETE é incomum mas necessário para identificar o item sem IDs.
  // -----------------------------------------------------------------------
  fastify.delete('/items', {
    preHandler: [authenticate],
  }, async (request, reply) => {
    const parsed = removeItemSchema.safeParse(request.body)
    if (!parsed.success) throw new ValidationError('Dados inválidos', parsed.error.flatten())

    const { sub: userId, role } = request.user
    const { itineraryId }       = request.params

    const list = await svc.removeItem(itineraryId, userId, role, parsed.data)
    return reply.send({ list })
  })
}

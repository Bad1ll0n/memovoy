// src/ai/wizard.routes.js
// Prefixo: /ai

import { z } from 'zod'
import { WizardService }   from './wizard.service.js'
import { authenticate }    from '../middleware/auth.js'
import { ValidationError } from '../shared/errors/index.js'

// ---------------------------------------------------------------------------
// Schema completo das 6 etapas do wizard
// Todos os campos são validados aqui — o service não valida de novo.
// ---------------------------------------------------------------------------
const wizardSchema = z.object({
  // Etapa 1: Destino
  destination: z.object({
    name:        z.string().min(2).max(120),
    countryCode: z.string().length(2).transform(s => s.toUpperCase()),
    lat:         z.number().min(-90).max(90).optional().nullable(),
    lng:         z.number().min(-180).max(180).optional().nullable(),
  }),

  // Etapa 2: Datas
  startDate: z.string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato de data inválido (YYYY-MM-DD)')
    .refine(d => new Date(d) >= new Date(new Date().toDateString()), {
      message: 'startDate não pode ser no passado',
    }),
  endDate: z.string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato de data inválido (YYYY-MM-DD)'),

  // Etapa 3: Grupo e transporte
  groupType: z.enum(['solo', 'couple', 'friends', 'family']),
  groupSize: z.number().int().min(1).max(20).default(1),
  transportModes: z.array(
    z.enum(['walking', 'public', 'car', 'bicycle', 'taxi', 'tour'])
  ).min(1).max(4),

  // Etapa 4: Preferências
  travelStyles: z.array(z.string().max(30)).max(5).default([]),
  budgetPerDay: z.number().int().positive().optional().nullable(),
  accommodationType: z.enum(['hotel', 'airbnb', 'hostel', 'boutique']).optional().nullable(),
  pacePreference: z.enum(['relaxed', 'moderate', 'intensive']).default('moderate'),

  // Etapa 5: Personalização
  dietaryRestrictions: z.array(z.string().max(50)).max(10).default([]),
  mustSeeAttractions:  z.array(z.string().max(100)).max(5).default([]),
  avoidCategories:     z.array(z.string().max(50)).max(5).default([]),

  // Etapa 6: Visibilidade
  visibility: z.enum(['public', 'followers', 'private']).default('public'),
  language:   z.enum(['pt-PT', 'pt-BR', 'en']).default('pt-PT'),
})
.refine(
  d => d.endDate >= d.startDate,
  { message: 'endDate deve ser igual ou posterior a startDate', path: ['endDate'] }
)
.refine(
  d => {
    const days = Math.round((new Date(d.endDate) - new Date(d.startDate)) / 86400000) + 1
    return days <= 21
  },
  { message: 'Máximo de 21 dias por roteiro', path: ['endDate'] }
)
.refine(
  d => !(d.groupType === 'solo' && d.groupSize > 1),
  { message: 'groupSize deve ser 1 para groupType=solo', path: ['groupSize'] }
)

// ---------------------------------------------------------------------------
// Wizard routes
// ---------------------------------------------------------------------------
export default async function wizardRoutes(fastify) {
  const svc = new WizardService(fastify.db)

  // -------------------------------------------------------------------------
  // POST /ai/generate
  // Gera roteiro completo com IA a partir das respostas do wizard.
  // Rate limit apertado: geração custa tokens e tempo de CPU na IA.
  // -------------------------------------------------------------------------
  fastify.post('/generate', {
    preHandler: [authenticate],
    config: {
      rateLimit: {
        max: 5,              // 5 gerações por utilizador
        timeWindow: '1 hour',
        keyGenerator: (req) => `wizard:${req.user.sub}`, // por utilizador, não por IP
      },
    },
  }, async (request, reply) => {
    const parsed = wizardSchema.safeParse(request.body)
    if (!parsed.success) {
      throw new ValidationError('Dados do wizard inválidos', parsed.error.flatten())
    }

    const { sub: userId, role } = request.user

    const result = await svc.generate(userId, role, parsed.data)

    // Informar o cliente se a geração usou fallback — a UI pode mostrar aviso
    return reply.status(201).send({
      itinerary: result.itinerary,
      meta: {
        generationId:  result.generationId,
        usedFallback:  result.usedFallback,
        fallbackLevel: result.fallbackLevel,
        // Só nível 3 (manual) merece aviso visível; nível 2 (cache) é transparente
        showFallbackWarning: result.fallbackLevel === 3,
      },
    })
  })

  // -------------------------------------------------------------------------
  // POST /ai/generate/:generationId/rate
  // Utilizador avalia a geração: thumbs up (5) ou thumbs down (1).
  // Alimenta o feedback loop de melhoria de prompts.
  // -------------------------------------------------------------------------
  fastify.post('/generate/:generationId/rate', {
    preHandler: [authenticate],
  }, async (request, reply) => {
    const { generationId } = request.params
    const { sub: userId }  = request.user

    const ratingSchema = z.object({
      rating: z.literal(1).or(z.literal(5)),
    })
    const parsed = ratingSchema.safeParse(request.body)
    if (!parsed.success) {
      throw new ValidationError('Rating deve ser 1 (negativo) ou 5 (positivo)')
    }

    const { sql } = fastify.db

    // Verificar que a geração pertence ao utilizador (não usar withUser aqui —
    // ai_generations não tem RLS, é uma tabela de sistema)
    const [gen] = await sql`
      SELECT id FROM ai_generations
      WHERE id = ${generationId} AND user_id = ${userId}
      LIMIT 1
    `
    if (!gen) {
      return reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'Geração não encontrada' } })
    }

    await sql`
      UPDATE ai_generations
      SET user_rating = ${parsed.data.rating}
      WHERE id = ${generationId}
    `

    return { ok: true }
  })
}

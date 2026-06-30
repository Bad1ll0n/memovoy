// src/expenses/expenses.routes.js
// Prefixo: /itineraries/:itineraryId/expenses
// Registado no server como subrotas de /itineraries

import { z } from 'zod'
import { ExpensesService } from './expenses.service.js'
import { authenticate }    from '../middleware/auth.js'
import { ValidationError } from '../shared/errors/index.js'

const createExpenseSchema = z.object({
  amountCents:  z.number().int().positive('Valor deve ser positivo'),
  currency:     z.string().length(3).regex(/^[A-Z]{3}$/, 'Código de moeda inválido (ex: EUR, JPY)'),
  category:     z.enum(['food','transport','accommodation','activities','shopping','health','other']),
  description:  z.string().max(200).optional().nullable(),
  dayId:        z.string().uuid().optional().nullable(),
  receiptUrl:   z.string().url().optional().nullable(),
  // ISO 8601 — quando o gasto ocorreu (pode ser no passado, durante a viagem)
  spentAt:      z.string().datetime().optional().nullable(),
})

const updateExpenseSchema = z.object({
  category:    z.enum(['food','transport','accommodation','activities','shopping','health','other']).optional(),
  description: z.string().max(200).nullable().optional(),
}).refine(d => Object.keys(d).length > 0, { message: 'Pelo menos um campo para actualizar' })

export default async function expensesRoutes(fastify) {
  const svc = new ExpensesService(fastify.db)

  // -----------------------------------------------------------------------
  // GET /itineraries/:itineraryId/expenses — listar gastos com totais
  // -----------------------------------------------------------------------
  fastify.get('/', {
    preHandler: [authenticate],
  }, async (request) => {
    const { sub: userId, role }    = request.user
    const { itineraryId }          = request.params

    return svc.list(userId, role, itineraryId)
  })

  // -----------------------------------------------------------------------
  // POST /itineraries/:itineraryId/expenses — registar gasto
  // -----------------------------------------------------------------------
  fastify.post('/', {
    preHandler: [authenticate],
  }, async (request, reply) => {
    const parsed = createExpenseSchema.safeParse(request.body)
    if (!parsed.success) throw new ValidationError('Dados inválidos', parsed.error.flatten())

    const { sub: userId, role } = request.user
    const { itineraryId }       = request.params

    const expense = await svc.create(userId, role, itineraryId, parsed.data)
    return reply.status(201).send({ expense })
  })

  // -----------------------------------------------------------------------
  // PATCH /itineraries/:itineraryId/expenses/:expenseId — editar gasto
  // -----------------------------------------------------------------------
  fastify.patch('/:expenseId', {
    preHandler: [authenticate],
  }, async (request) => {
    const parsed = updateExpenseSchema.safeParse(request.body)
    if (!parsed.success) throw new ValidationError('Dados inválidos', parsed.error.flatten())

    const { sub: userId, role } = request.user
    return svc.update(request.params.expenseId, userId, role, parsed.data)
  })

  // -----------------------------------------------------------------------
  // DELETE /itineraries/:itineraryId/expenses/:expenseId — apagar gasto
  // -----------------------------------------------------------------------
  fastify.delete('/:expenseId', {
    preHandler: [authenticate],
  }, async (request, reply) => {
    const { sub: userId, role } = request.user
    await svc.delete(request.params.expenseId, userId, role)
    return reply.status(204).send()
  })

  // -----------------------------------------------------------------------
  // GET /itineraries/:itineraryId/expenses/rates — taxas de câmbio actuais
  // Sem autenticação — informação pública usada antes de submeter o formulário.
  // -----------------------------------------------------------------------
  fastify.get('/rates', async () => {
    return { rates: svc.currentRates() }
  })
}

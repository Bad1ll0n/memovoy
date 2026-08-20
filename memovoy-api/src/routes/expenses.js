import { z } from 'zod'
import { query } from '../db/pool.js'

const CATEGORIES = ['transporte', 'alojamento', 'refeições', 'lazer', 'compras', 'outros']

const expenseSchema = z.object({
  amount:       z.number().positive(),
  currency:     z.string().min(1).max(5).default('EUR'),
  category:     z.enum(['transporte', 'alojamento', 'refeições', 'lazer', 'compras', 'outros']),
  description:  z.string().max(200).default(''),
  expense_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
})

async function assertOwner(itineraryId, userId, reply) {
  const { rows } = await query('SELECT user_id FROM itineraries WHERE id = $1', [itineraryId])
  if (rows.length === 0) { reply.status(404).send({ message: 'Roteiro não encontrado.' }); return false }
  if (rows[0].user_id !== userId) { reply.status(403).send({ message: 'Sem permissão.' }); return false }
  return true
}

export async function expensesRoutes(app) {
  // GET /expenses/itinerary/:itineraryId — listar despesas agrupadas + total
  app.get('/itinerary/:itineraryId', { preHandler: [app.authenticate] }, async (request, reply) => {
    const { itineraryId } = request.params

    const { rows } = await query(
      `SELECT id, amount, currency, category, description, expense_date, created_at
       FROM expenses
       WHERE itinerary_id = $1 AND user_id = $2
       ORDER BY expense_date DESC NULLS LAST, created_at DESC`,
      [itineraryId, request.user.id],
    )

    const total = rows.reduce((s, r) => s + Number(r.amount), 0)

    // Group by category
    const byCategory = Object.fromEntries(CATEGORIES.map((c) => [c, 0]))
    rows.forEach((r) => { byCategory[r.category] = (byCategory[r.category] ?? 0) + Number(r.amount) })

    return reply.send({
      expenses: rows.map((r) => ({
        id:          r.id,
        amount:      Number(r.amount),
        currency:    r.currency,
        category:    r.category,
        description: r.description,
        expenseDate: r.expense_date,
        createdAt:   r.created_at,
      })),
      total,
      byCategory,
    })
  })

  // POST /expenses/itinerary/:itineraryId — adicionar despesa
  app.post('/itinerary/:itineraryId', { preHandler: [app.authenticate] }, async (request, reply) => {
    const { itineraryId } = request.params
    if (!(await assertOwner(itineraryId, request.user.id, reply))) return

    const parsed = expenseSchema.safeParse(request.body)
    if (!parsed.success) return reply.status(400).send({ message: parsed.error.errors[0].message })

    const { amount, currency, category, description, expense_date } = parsed.data

    const { rows } = await query(
      `INSERT INTO expenses (itinerary_id, user_id, amount, currency, category, description, expense_date)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, amount, currency, category, description, expense_date, created_at`,
      [itineraryId, request.user.id, amount, currency, category, description, expense_date ?? null],
    )

    const r = rows[0]
    return reply.status(201).send({
      id:          r.id,
      amount:      Number(r.amount),
      currency:    r.currency,
      category:    r.category,
      description: r.description,
      expenseDate: r.expense_date,
      createdAt:   r.created_at,
    })
  })

  // PATCH /expenses/:id — editar despesa
  app.patch('/:id', { preHandler: [app.authenticate] }, async (request, reply) => {
    const { rows: check } = await query(
      'SELECT user_id FROM expenses WHERE id = $1',
      [request.params.id],
    )
    if (check.length === 0) return reply.status(404).send({ message: 'Despesa não encontrada.' })
    if (check[0].user_id !== request.user.id) return reply.status(403).send({ message: 'Sem permissão.' })

    const parsed = expenseSchema.partial().safeParse(request.body)
    if (!parsed.success) return reply.status(400).send({ message: parsed.error.errors[0].message })

    const fields = parsed.data
    const keys = Object.keys(fields)
    if (keys.length === 0) return reply.status(400).send({ message: 'Nenhum campo para actualizar.' })

    const setClauses = keys.map((k, i) => `${k} = $${i + 2}`).join(', ')
    const values = keys.map((k) => fields[k])

    await query(
      `UPDATE expenses SET ${setClauses} WHERE id = $1`,
      [request.params.id, ...values],
    )

    return reply.send({ ok: true })
  })

  // DELETE /expenses/:id — eliminar despesa
  app.delete('/:id', { preHandler: [app.authenticate] }, async (request, reply) => {
    const { rows } = await query('SELECT user_id FROM expenses WHERE id = $1', [request.params.id])
    if (rows.length === 0) return reply.status(404).send({ message: 'Despesa não encontrada.' })
    if (rows[0].user_id !== request.user.id) return reply.status(403).send({ message: 'Sem permissão.' })

    await query('DELETE FROM expenses WHERE id = $1', [request.params.id])
    return reply.send({ ok: true })
  })

  // GET /expenses/rates?base=EUR — ECB exchange rates via frankfurter.app (cached 24h)
  let _ratesCache = null
  let _ratesCacheTime = 0
  const RATES_TTL = 24 * 60 * 60 * 1000

  app.get('/rates', async (request, reply) => {
    const base = (request.query.base ?? 'EUR').toUpperCase().slice(0, 5)

    const now = Date.now()
    if (_ratesCache && _ratesCacheTime && (now - _ratesCacheTime) < RATES_TTL && _ratesCache.base === base) {
      return reply.send(_ratesCache)
    }

    try {
      const res = await fetch(`https://api.frankfurter.app/latest?base=${base}`)
      if (!res.ok) throw new Error('upstream error')
      const data = await res.json()
      _ratesCache     = { base: data.base, date: data.date, rates: data.rates }
      _ratesCacheTime = now
      return reply.send(_ratesCache)
    } catch {
      if (_ratesCache) return reply.send(_ratesCache) // serve stale on error
      return reply.status(503).send({ message: 'Serviço de taxas de câmbio temporariamente indisponível.' })
    }
  })
}

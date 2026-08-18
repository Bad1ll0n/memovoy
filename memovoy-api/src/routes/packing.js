import { z } from 'zod'
import { query } from '../db/pool.js'
import { agentGeneratePackingList } from '../services/aiAgent.js'

async function assertOwner(itineraryId, userId, reply) {
  const { rows } = await query('SELECT user_id FROM itineraries WHERE id = $1', [itineraryId])
  if (rows.length === 0) { reply.status(404).send({ message: 'Roteiro não encontrado.' }); return false }
  if (rows[0].user_id !== userId) { reply.status(403).send({ message: 'Sem permissão.' }); return false }
  return true
}

export async function packingRoutes(app) {
  // GET /packing/itinerary/:itineraryId — listar items
  app.get('/itinerary/:itineraryId', { preHandler: [app.authenticate] }, async (request, reply) => {
    const { itineraryId } = request.params

    const { rows } = await query(
      `SELECT id, label, packed, created_at, sort_order
       FROM packing_items
       WHERE itinerary_id = $1 AND user_id = $2
       ORDER BY sort_order ASC, created_at ASC`,
      [itineraryId, request.user.id],
    )

    reply.send({
      items: rows.map((r) => ({
        id:        r.id,
        label:     r.label,
        packed:    r.packed,
        sortOrder: r.sort_order,
        createdAt: r.created_at,
      })),
      total:  rows.length,
      packed: rows.filter((r) => r.packed).length,
    })
  })

  // POST /packing/itinerary/:itineraryId — adicionar item
  app.post('/itinerary/:itineraryId', { preHandler: [app.authenticate] }, async (request, reply) => {
    const { itineraryId } = request.params
    if (!(await assertOwner(itineraryId, request.user.id, reply))) return

    const schema = z.object({ label: z.string().min(1).max(200) })
    const parsed = schema.safeParse(request.body)
    if (!parsed.success) return reply.status(400).send({ message: parsed.error.errors[0].message })

    const { rows: countRows } = await query(
      'SELECT COUNT(*) AS cnt FROM packing_items WHERE itinerary_id = $1 AND user_id = $2',
      [itineraryId, request.user.id],
    )
    const sortOrder = Number(countRows[0].cnt)

    const { rows } = await query(
      `INSERT INTO packing_items (itinerary_id, user_id, label, packed, sort_order)
       VALUES ($1, $2, $3, FALSE, $4)
       RETURNING id, label, packed, sort_order, created_at`,
      [itineraryId, request.user.id, parsed.data.label, sortOrder],
    )

    const r = rows[0]
    reply.status(201).send({ id: r.id, label: r.label, packed: r.packed, sortOrder: r.sort_order, createdAt: r.created_at })
  })

  // POST /packing/itinerary/:itineraryId/reorder — reorder items
  app.post('/itinerary/:itineraryId/reorder', { preHandler: [app.authenticate] }, async (request, reply) => {
    const { itineraryId } = request.params
    if (!(await assertOwner(itineraryId, request.user.id, reply))) return

    const schema = z.object({ orderedIds: z.array(z.string().uuid()).min(1) })
    const parsed = schema.safeParse(request.body)
    if (!parsed.success) return reply.status(400).send({ message: parsed.error.errors[0].message })

    const ids  = parsed.data.orderedIds
    const idxs = ids.map((_, i) => i)
    await query(
      `UPDATE packing_items pi
       SET sort_order = v.idx
       FROM (SELECT unnest($1::uuid[]) AS id, unnest($2::int[]) AS idx) v
       WHERE pi.id = v.id AND pi.user_id = $3`,
      [ids, idxs, request.user.id],
    )
    reply.send({ ok: true })
  })

  // PATCH /packing/:id — toggle packed ou editar label
  app.patch('/:id', { preHandler: [app.authenticate] }, async (request, reply) => {
    const { rows: check } = await query(
      'SELECT user_id FROM packing_items WHERE id = $1',
      [request.params.id],
    )
    if (check.length === 0) return reply.status(404).send({ message: 'Item não encontrado.' })
    if (check[0].user_id !== request.user.id) return reply.status(403).send({ message: 'Sem permissão.' })

    const schema = z.object({
      label:  z.string().min(1).max(200).optional(),
      packed: z.boolean().optional(),
    })
    const parsed = schema.safeParse(request.body)
    if (!parsed.success) return reply.status(400).send({ message: parsed.error.errors[0].message })

    const { label, packed } = parsed.data
    if (label === undefined && packed === undefined) {
      return reply.status(400).send({ message: 'Nenhum campo para actualizar.' })
    }

    const sets = []
    const vals = [request.params.id]
    if (label !== undefined)  { sets.push(`label = $${vals.length + 1}`);  vals.push(label) }
    if (packed !== undefined) { sets.push(`packed = $${vals.length + 1}`); vals.push(packed) }

    await query(`UPDATE packing_items SET ${sets.join(', ')} WHERE id = $1`, vals)

    reply.send({ ok: true })
  })

  // POST /packing/itinerary/:itineraryId/ai-suggest — AI-generated packing list
  app.post('/itinerary/:itineraryId/ai-suggest', { preHandler: [app.authenticate], config: { rateLimit: { max: 5, timeWindow: '1 minute' } } }, async (request, reply) => {
    const { itineraryId } = request.params
    if (!(await assertOwner(itineraryId, request.user.id, reply))) return

    const { rows: itiRows } = await query(
      'SELECT destination, country, start_date, end_date, group_type, travel_style FROM itineraries WHERE id = $1',
      [itineraryId],
    )
    if (itiRows.length === 0) return reply.status(404).send({ message: 'Roteiro não encontrado.' })

    const iti  = itiRows[0]
    const days = iti.start_date && iti.end_date
      ? Math.max(1, Math.round((new Date(iti.end_date) - new Date(iti.start_date)) / 86400000) + 1)
      : 7

    try {
      const result = await agentGeneratePackingList({
        destination: iti.destination,
        country:     iti.country ?? '',
        days,
        travelStyle: iti.travel_style ?? [],
        groupType:   iti.group_type  ?? 'solo',
      })
      reply.send({ items: result.items ?? [] })
    } catch {
      reply.status(500).send({ message: 'Erro ao gerar lista. Tenta novamente.' })
    }
  })

  // DELETE /packing/:id — remover item
  app.delete('/:id', { preHandler: [app.authenticate] }, async (request, reply) => {
    const { rows } = await query('SELECT user_id FROM packing_items WHERE id = $1', [request.params.id])
    if (rows.length === 0) return reply.status(404).send({ message: 'Item não encontrado.' })
    if (rows[0].user_id !== request.user.id) return reply.status(403).send({ message: 'Sem permissão.' })

    await query('DELETE FROM packing_items WHERE id = $1', [request.params.id])
    reply.send({ ok: true })
  })
}

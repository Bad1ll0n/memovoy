import { z } from 'zod'
import { query } from '../db/pool.js'
import { agentModerateReport } from '../services/aiAgent.js'

const schema = z.object({
  targetType: z.enum(['post', 'comment', 'itinerary', 'user']),
  targetId:   z.string().uuid(),
  reason:     z.enum(['spam', 'hate', 'violence', 'nudity', 'misinformation', 'other']),
  detail:     z.string().max(500).optional(),
})

export async function reportsRoutes(app) {
  app.post('/', { preHandler: [app.authenticate] }, async (request, reply) => {
    const parsed = schema.safeParse(request.body)
    if (!parsed.success) return reply.status(400).send({ message: parsed.error.errors[0].message })

    const { targetType, targetId, reason, detail } = parsed.data

    // Denunciar-se a si próprio não faz sentido e só enche a fila de moderação.
    if (targetType === 'user' && targetId === request.user.id) {
      return reply.status(400).send({ message: 'Não podes denunciar-te a ti próprio.' })
    }

    // Confirmar que o alvo existe. Sem isto aceitava-se qualquer UUID e a fila
    // enchia-se de denúncias sobre conteúdo inexistente — a moderação por IA
    // corria à mesma, a gastar chamadas.
    const TABELA_DO_ALVO = {
      post:      'posts',
      comment:   'post_comments',
      itinerary: 'itineraries',
      user:      'users',
    }
    const { rows: alvo } = await query(
      `SELECT 1 FROM ${TABELA_DO_ALVO[targetType]} WHERE id = $1`,
      [targetId],
    )
    if (alvo.length === 0) {
      return reply.status(404).send({ message: 'Conteúdo não encontrado.' })
    }

    try {
      const { rowCount } = await query(
        `INSERT INTO content_reports (reporter_id, target_type, target_id, reason, detail)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (reporter_id, target_type, target_id) DO NOTHING`,
        [request.user.id, targetType, targetId, reason, detail ?? null],
      )

      // Auto-moderate: classify severity async and update the report
      if (rowCount > 0) {
        agentModerateReport({ targetType, reason, detail }).then(async (mod) => {
          if (!mod?.severity) return
          await query(
            `UPDATE content_reports SET
               ai_severity = $1, ai_action = $2, ai_reasoning = $3
             WHERE reporter_id = $4 AND target_type = $5 AND target_id = $6`,
            [mod.severity, mod.action, mod.reasoning, request.user.id, targetType, targetId],
          ).catch(() => {})

          // Auto-remove on critical severity — flag for admin review via notification
          if (mod.severity === 'critical' && global._io) {
            global._io.to('admin:alerts').emit('moderation_alert', { targetType, targetId, severity: mod.severity, action: mod.action })
          }
        }).catch(() => {})
      }
    } catch {
      // Swallow — reporter already reported this item
    }

    return reply.status(201).send({ ok: true })
  })
}

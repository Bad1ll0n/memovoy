import { query } from '../db/pool.js'

export async function rankingsRoutes(app) {
  // Só sobra a lista de destinos em alta.
  //
  // O /travellers alimentava a página /rankings e o cartão "Top Viajantes", que
  // foram removidos por decisão de produto — a app deixa de ter tabela
  // classificativa de pessoas. Os destinos em alta são sobre sítios e não sobre
  // quem pontua mais, por isso ficam.
  //
  // A coluna users.score continua a existir e a ser actualizada: é o que
  // desbloqueia os badges, que se mantêm no perfil.

  // GET /rankings/trending?limit= — with week-over-week delta %
  app.get('/trending', async (request, reply) => {
    const limit = Math.min(Number(request.query.limit ?? 10), 50)

    const { rows } = await query(
      `WITH this_week AS (
         SELECT destination, COUNT(*) AS cnt
         FROM itineraries
         WHERE is_public = TRUE AND destination IS NOT NULL
           AND created_at > NOW() - INTERVAL '7 days'
         GROUP BY destination
       ),
       last_week AS (
         SELECT destination, COUNT(*) AS cnt
         FROM itineraries
         WHERE is_public = TRUE AND destination IS NOT NULL
           AND created_at BETWEEN NOW() - INTERVAL '14 days' AND NOW() - INTERVAL '7 days'
         GROUP BY destination
       )
       SELECT
         t.destination,
         t.cnt AS this_week_cnt,
         COALESCE(l.cnt, 0) AS last_week_cnt,
         CASE
           WHEN COALESCE(l.cnt, 0) = 0 THEN 100
           ELSE ROUND(((t.cnt::numeric - l.cnt::numeric) / l.cnt::numeric) * 100)
         END AS delta_pct
       FROM this_week t
       LEFT JOIN last_week l ON l.destination = t.destination
       ORDER BY t.cnt DESC
       LIMIT $1`,
      [limit],
    )

    return reply.send(
      rows.map((r) => ({
        destination: r.destination,
        count:       Number(r.this_week_cnt),
        deltaPct:    Number(r.delta_pct),
        trend:       Number(r.delta_pct) >= 0 ? 'up' : 'down',
      })),
    )
  })
}

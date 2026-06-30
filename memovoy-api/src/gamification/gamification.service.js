// src/gamification/gamification.service.js
//
// Responsabilidades:
//   - Avaliar progresso em desafios após eventos relevantes (publicar roteiro,
//     atingir X países, etc.)
//   - Atribuir badges quando um desafio é concluído ou nível é atingido
//   - Atualizar streaks mensais
//   - Devolver leaderboard e perfil de gamificação do utilizador
//
// Decisão de design: a avaliação de progresso é chamada explicitamente
// pelos outros services após operações relevantes (publish, follow, etc.).
// Não usamos triggers PostgreSQL para isto — a lógica de negócio fica
// em JavaScript onde é testável e versionável.
//
// Todos os métodos de avaliação são fire-and-forget do ponto de vista
// do chamador — falhas não devem bloquear a operação principal.

import { NotFoundError } from '../shared/errors/index.js'

export class GamificationService {
  constructor(db) {
    this.db = db
  }

  // -------------------------------------------------------------------------
  // evaluateOnPublish
  // Chamado por itineraries.service.js após publicação bem-sucedida.
  // Avalia todos os desafios do tipo 'post_count' e 'country_count'
  // e actualiza o streak mensal.
  // -------------------------------------------------------------------------
  async evaluateOnPublish(userId, role, itinerary) {
    await Promise.allSettled([
      this._updateStreak(userId, role),
      this._evaluateChallenges(userId, role, {
        post_count:   () => this._countPublishedItineraries(userId),
        country_count: () => this._countUniqueCountries(userId),
        low_carbon:   () => this._checkCarbonChallenge(userId, itinerary.id),
      }),
      this._evaluateLevelUp(userId, role),
    ])
  }

  // -------------------------------------------------------------------------
  // evaluateOnSave
  // Chamado por itineraries.service.js quando um utilizador guarda um roteiro.
  // -------------------------------------------------------------------------
  async evaluateOnSave(userId, role) {
    await this._evaluateChallenges(userId, role, {
      save_count: () => this._countSaves(userId),
    })
  }

  // -------------------------------------------------------------------------
  // getProfile — perfil completo de gamificação
  // -------------------------------------------------------------------------
  async getProfile(userId) {
    const { sql } = this.db

    const [streak] = await sql`
      SELECT current_streak, longest_streak, last_activity_month
      FROM streaks WHERE user_id = ${userId}
    `

    const badges = await sql`
      SELECT
        b.id, b.name, b.description, b.icon_url, b.category,
        ub.earned_at
      FROM user_badges ub
      JOIN badges b ON b.id = ub.badge_id
      WHERE ub.user_id = ${userId}
      ORDER BY ub.earned_at DESC
    `

    const activeChallenges = await sql`
      SELECT
        c.id, c.title, c.description, c.type, c.target_value,
        c.location_name, c.ends_at,
        uc.current_value, uc.status, uc.started_at,
        -- Percentagem de progresso (0–100)
        LEAST(
          ROUND((uc.current_value::numeric / c.target_value) * 100),
          100
        ) AS progress_pct,
        -- Badge que será atribuído ao completar
        b.name AS reward_badge_name,
        b.icon_url AS reward_badge_icon
      FROM user_challenges uc
      JOIN challenges c ON c.id = uc.challenge_id
      LEFT JOIN badges b ON b.id = c.badge_id
      WHERE uc.user_id = ${userId}
        AND uc.status = 'in_progress'
        AND c.is_active = true
      ORDER BY progress_pct DESC
    `

    const [counts] = await sql`
      SELECT
        (SELECT COUNT(*) FROM user_badges WHERE user_id = ${userId})   AS badge_count,
        (SELECT COUNT(*) FROM user_challenges
          WHERE user_id = ${userId} AND status = 'completed')          AS completed_challenges
    `

    return {
      streak: streak ?? { current_streak: 0, longest_streak: 0 },
      badges,
      activeChallenges,
      stats: {
        badgeCount:           parseInt(counts.badge_count),
        completedChallenges:  parseInt(counts.completed_challenges),
      },
    }
  }

  // -------------------------------------------------------------------------
  // listChallenges — desafios disponíveis com progresso do utilizador
  // -------------------------------------------------------------------------
  async listChallenges(userId) {
    const { sql } = this.db

    const challenges = await sql`
      SELECT
        c.id, c.title, c.description, c.type, c.target_value,
        c.location_name, c.starts_at, c.ends_at,
        b.name      AS reward_badge_name,
        b.icon_url  AS reward_badge_icon,
        b.category  AS reward_badge_category,
        -- Progresso do utilizador neste desafio (NULL se não iniciado)
        uc.current_value,
        uc.status,
        uc.started_at,
        uc.completed_at,
        CASE
          WHEN uc.current_value IS NOT NULL
          THEN LEAST(ROUND((uc.current_value::numeric / c.target_value) * 100), 100)
          ELSE 0
        END AS progress_pct
      FROM challenges c
      LEFT JOIN badges b ON b.id = c.badge_id
      LEFT JOIN user_challenges uc
        ON uc.challenge_id = c.id AND uc.user_id = ${userId}
      WHERE c.is_active = true
        AND (c.ends_at IS NULL OR c.ends_at > NOW())
      ORDER BY
        -- Desafios em progresso primeiro, depois não iniciados
        CASE uc.status
          WHEN 'in_progress' THEN 0
          ELSE 1
        END,
        progress_pct DESC,
        c.id
    `

    return challenges
  }

  // -------------------------------------------------------------------------
  // joinChallenge — utilizador entra num desafio
  // -------------------------------------------------------------------------
  async joinChallenge(userId, role, challengeId) {
    const { sql } = this.db

    // Verificar que o desafio existe e está activo
    const [challenge] = await sql`
      SELECT id, type, target_value FROM challenges
      WHERE id = ${challengeId}
        AND is_active = true
        AND (ends_at IS NULL OR ends_at > NOW())
      LIMIT 1
    `
    if (!challenge) throw new NotFoundError('Desafio')

    return this.db.withUser(userId, role, async (tx) => {
      // Calcular valor inicial já obtido (para desafios já parcialmente completos)
      const initialValue = await this._getCurrentValueForType(tx, userId, challenge.type)

      const [entry] = await tx`
        INSERT INTO user_challenges (user_id, challenge_id, current_value, status)
        VALUES (${userId}, ${challengeId}, ${initialValue}, 'in_progress')
        ON CONFLICT (user_id, challenge_id) DO NOTHING
        RETURNING user_id, challenge_id, current_value, status, started_at
      `

      // Se já existia, retornar o existente
      if (!entry) {
        const [existing] = await tx`
          SELECT user_id, challenge_id, current_value, status, started_at
          FROM user_challenges
          WHERE user_id = ${userId} AND challenge_id = ${challengeId}
        `
        return existing
      }

      // Verificar se já está completo desde o início (edge case: utilizador
      // com muitos roteiros entra num desafio de post_count já atingido)
      if (initialValue >= challenge.target_value) {
        await this._completeChallenge(tx, userId, challenge, initialValue)
      }

      return entry
    })
  }

  // -------------------------------------------------------------------------
  // getLeaderboard — top utilizadores por tipo
  // -------------------------------------------------------------------------
  async getLeaderboard(type, { period, scopeId, limit = 20 }) {
    const { sql } = this.db

    limit = Math.min(limit, 50)

    const periodDate = period
      ? new Date(period).toISOString().slice(0, 7) + '-01'  // normalizar para 1º do mês
      : new Date(new Date().setDate(1)).toISOString().slice(0, 10) // 1º do mês actual

    const rows = await sql`
      SELECT
        le.rank,
        le.score,
        le.updated_at,
        u.id   AS user_id,
        u.username,
        up.display_name,
        up.avatar_url,
        up.level,
        u.follower_count
      FROM leaderboard_entries le
      JOIN users u          ON u.id = le.user_id
      JOIN user_profiles up ON up.user_id = le.user_id
      WHERE le.leaderboard_type = ${type}
        AND le.period_start     = ${periodDate}
        ${scopeId ? sql`AND le.scope_id = ${scopeId}` : sql`AND le.scope_id IS NULL`}
        AND u.deleted_at IS NULL
      ORDER BY le.rank ASC
      LIMIT ${limit}
    `

    return { entries: rows, period: periodDate, type }
  }

  // -------------------------------------------------------------------------
  // recalculateLeaderboard
  // Job periódico — recalcula rankings para o mês actual.
  // Deve ser chamado por um cron job (ex: diariamente às 2h UTC).
  // -------------------------------------------------------------------------
  async recalculateLeaderboard() {
    const { sql } = this.db

    const periodStart = new Date(new Date().setDate(1)).toISOString().slice(0, 10)

    // Top by trip count (global_trips)
    await sql`
      INSERT INTO leaderboard_entries
        (user_id, leaderboard_type, period_start, score, rank)
      SELECT
        i.user_id,
        'global_trips',
        ${periodStart}::date,
        COUNT(*)::integer AS score,
        ROW_NUMBER() OVER (ORDER BY COUNT(*) DESC)::integer AS rank
      FROM itineraries i
      WHERE i.status = 'published'
        AND i.deleted_at IS NULL
        AND i.published_at >= ${periodStart}::date
        AND i.published_at <  ${periodStart}::date + INTERVAL '1 month'
      GROUP BY i.user_id
      ON CONFLICT (user_id, leaderboard_type, period_start)
        WHERE scope_id IS NULL
      DO UPDATE SET
        score      = EXCLUDED.score,
        rank       = EXCLUDED.rank,
        updated_at = NOW()
    `

    // Top by carbon (low_carbon) — menos CO₂ = melhor
    await sql`
      INSERT INTO leaderboard_entries
        (user_id, leaderboard_type, period_start, score, rank)
      SELECT
        i.user_id,
        'low_carbon',
        ${periodStart}::date,
        -- Score: pontos invertidos (1000 - kg_co2, mínimo 0)
        GREATEST(0, 1000 - ROUND(AVG(ic.total_kg_co2)))::integer AS score,
        ROW_NUMBER() OVER (ORDER BY AVG(ic.total_kg_co2) ASC)::integer AS rank
      FROM itineraries i
      JOIN itinerary_carbon ic ON ic.itinerary_id = i.id
      WHERE i.status = 'published'
        AND i.deleted_at IS NULL
        AND i.published_at >= ${periodStart}::date
        AND i.published_at <  ${periodStart}::date + INTERVAL '1 month'
      GROUP BY i.user_id
      HAVING COUNT(*) >= 1
      ON CONFLICT (user_id, leaderboard_type, period_start)
        WHERE scope_id IS NULL
      DO UPDATE SET
        score      = EXCLUDED.score,
        rank       = EXCLUDED.rank,
        updated_at = NOW()
    `

    return { recalculated: true, period: periodStart }
  }

  // =========================================================================
  // Private helpers
  // =========================================================================

  // Avaliar um conjunto de tipos de desafio para um utilizador.
  // challengeResolvers: { type: () => Promise<number> }
  async _evaluateChallenges(userId, role, challengeResolvers) {
    const { sql } = this.db

    // Buscar todos os desafios activos do utilizador para os tipos relevantes
    const types = Object.keys(challengeResolvers)
    if (types.length === 0) return

    const active = await sql`
      SELECT uc.challenge_id, uc.current_value, c.type, c.target_value, c.badge_id
      FROM user_challenges uc
      JOIN challenges c ON c.id = uc.challenge_id
      WHERE uc.user_id = ${userId}
        AND uc.status = 'in_progress'
        AND c.type = ANY(${types})
        AND c.is_active = true
    `

    if (active.length === 0) return

    // Calcular valores actuais — uma vez por tipo, não por desafio
    const valueCache = {}
    for (const type of types) {
      try {
        valueCache[type] = await challengeResolvers[type]()
      } catch {
        // Se um resolver falhar, ignorar esse tipo mas continuar com os outros
        valueCache[type] = null
      }
    }

    // Actualizar progresso em batch
    await this.db.withUser(userId, role, async (tx) => {
      for (const challenge of active) {
        const newValue = valueCache[challenge.type]
        if (newValue === null || newValue === undefined) continue
        if (newValue <= challenge.current_value) continue // sem progresso

        await tx`
          UPDATE user_challenges
          SET current_value = ${newValue}
          WHERE user_id      = ${userId}
            AND challenge_id = ${challenge.challenge_id}
            AND status       = 'in_progress'
        `

        if (newValue >= challenge.target_value) {
          await this._completeChallenge(tx, userId, challenge, newValue)
        }
      }
    })
  }

  async _completeChallenge(sql, userId, challenge, finalValue) {
    // Marcar desafio como concluído
    await sql`
      UPDATE user_challenges
      SET status       = 'completed',
          current_value = ${finalValue},
          completed_at  = NOW()
      WHERE user_id      = ${userId}
        AND challenge_id = ${challenge.challenge_id ?? challenge.id}
    `

    // Atribuir badge se o desafio tiver um
    if (challenge.badge_id) {
      await sql`
        INSERT INTO user_badges (user_id, badge_id, challenge_id)
        VALUES (${userId}, ${challenge.badge_id}, ${challenge.challenge_id ?? challenge.id})
        ON CONFLICT (user_id, badge_id) DO NOTHING
      `

      // Notificar (a coluna challenge_id pode não existir no challenge
      // se vier de joinChallenge — usar o badge_id que sempre existe)
      await sql`
        INSERT INTO notifications (user_id, type, title, body, channel, status)
        SELECT
          ${userId},
          'badge_earned',
          'Novo badge desbloqueado! 🏆',
          'Ganhou o badge: ' || b.name,
          'push',
          'pending'
        FROM badges b WHERE b.id = ${challenge.badge_id}
      `
    }

    // Notificação de desafio concluído (mesmo sem badge)
    await sql`
      INSERT INTO notifications (user_id, type, title, channel, status)
      SELECT
        ${userId},
        'challenge_complete',
        '🎯 Desafio concluído: ' || c.title,
        'push',
        'pending'
      FROM challenges c WHERE c.id = ${challenge.challenge_id ?? challenge.id}
    `
  }

  async _updateStreak(userId, role) {
    const thisMonth = new Date(new Date().setDate(1)).toISOString().slice(0, 10)

    return this.db.withUser(userId, role, async (sql) => {
      const [streak] = await sql`
        SELECT current_streak, longest_streak, last_activity_month
        FROM streaks WHERE user_id = ${userId}
      `

      if (!streak) return // Streak não existe ainda — criado no register

      const last    = streak.last_activity_month
      const lastStr = last ? new Date(last).toISOString().slice(0, 7) : null
      const thisStr = thisMonth.slice(0, 7)

      // Já publicou este mês — nada a fazer
      if (lastStr === thisStr) return

      // Mês consecutivo — incrementar streak
      const prevMonth = new Date(new Date().setDate(1))
      prevMonth.setMonth(prevMonth.getMonth() - 1)
      const prevStr = prevMonth.toISOString().slice(0, 7)

      const isConsecutive = lastStr === prevStr
      const newStreak     = isConsecutive ? streak.current_streak + 1 : 1
      const longestStreak = Math.max(streak.longest_streak, newStreak)

      await sql`
        UPDATE streaks SET
          current_streak      = ${newStreak},
          longest_streak      = ${longestStreak},
          last_activity_month = ${thisMonth}::date,
          updated_at          = NOW()
        WHERE user_id = ${userId}
      `

      // Badge de streak ao atingir 3 meses consecutivos
      if (newStreak === 3) {
        const { sql: outerSql } = this.db
        const [badge] = await outerSql`
          SELECT id FROM badges WHERE name = 'Streak 3' LIMIT 1
        `
        if (badge) {
          await outerSql`
            INSERT INTO user_badges (user_id, badge_id)
            VALUES (${userId}, ${badge.id})
            ON CONFLICT (user_id, badge_id) DO NOTHING
          `
        }
      }
    })
  }

  async _evaluateLevelUp(userId, role) {
    const { sql } = this.db

    const [profile] = await sql`
      SELECT total_trips, total_countries, level FROM user_profiles
      WHERE user_id = ${userId}
    `
    if (!profile) return

    // Regras de nível baseadas em viagens e países
    let newLevel = 'explorer'
    if (profile.total_trips >= 25 || profile.total_countries >= 20) newLevel = 'globetrotter'
    else if (profile.total_trips >= 10 || profile.total_countries >= 10) newLevel = 'nomad'
    else if (profile.total_trips >= 3  || profile.total_countries >= 3)  newLevel = 'traveler'

    if (newLevel === profile.level) return

    await this.db.withUser(userId, role, async (tx) => {
      await tx`
        UPDATE user_profiles SET level = ${newLevel}
        WHERE user_id = ${userId}
      `

      // Atribuir badge de nível
      const [badge] = await tx`
        SELECT id FROM badges
        WHERE name = ${this._levelBadgeName(newLevel)} AND category = 'level'
        LIMIT 1
      `
      if (badge) {
        await tx`
          INSERT INTO user_badges (user_id, badge_id)
          VALUES (${userId}, ${badge.id})
          ON CONFLICT (user_id, badge_id) DO NOTHING
        `
      }

      // Notificar subida de nível
      await tx`
        INSERT INTO notifications (user_id, type, title, body, channel, status)
        VALUES (
          ${userId}, 'badge_earned',
          '🌍 Subiste de nível!',
          ${'Atingiste o nível ' + newLevel},
          'push', 'pending'
        )
      `
    })
  }

  _levelBadgeName(level) {
    const map = {
      traveler:     'Viajante',
      nomad:        'Nómada',
      globetrotter: 'Globetrotter',
    }
    return map[level] ?? level
  }

  // Contadores para avaliação de desafios
  async _countPublishedItineraries(userId) {
    const { sql } = this.db
    const [{ count }] = await sql`
      SELECT COUNT(*)::integer AS count FROM itineraries
      WHERE user_id = ${userId} AND status = 'published' AND deleted_at IS NULL
    `
    return parseInt(count)
  }

  async _countUniqueCountries(userId) {
    const { sql } = this.db
    const [profile] = await sql`
      SELECT total_countries FROM user_profiles WHERE user_id = ${userId}
    `
    return profile?.total_countries ?? 0
  }

  async _countSaves(userId) {
    const { sql } = this.db
    const [{ count }] = await sql`
      SELECT COUNT(*)::integer AS count FROM saves WHERE user_id = ${userId}
    `
    return parseInt(count)
  }

  async _checkCarbonChallenge(userId, itineraryId) {
    const { sql } = this.db
    // Para low_carbon: devolve o kg_co2 do roteiro recém publicado
    // O desafio target_value é o limiar máximo (ex: 100kg)
    const [carbon] = await sql`
      SELECT total_kg_co2 FROM itinerary_carbon WHERE itinerary_id = ${itineraryId}
    `
    // Devolver CO2 invertido para que maior = melhor
    // (desafio: publicar com < 100kg → target = 100, current = kg_co2)
    return carbon ? Math.round(carbon.total_kg_co2) : null
  }

  async _getCurrentValueForType(sql, userId, type) {
    // Valor inicial ao entrar num desafio — evitar começar do zero
    // se o utilizador já tem progresso
    switch (type) {
      case 'post_count':   return this._countPublishedItineraries(userId)
      case 'country_count': return this._countUniqueCountries(userId)
      case 'save_count':   return this._countSaves(userId)
      default:             return 0
    }
  }
}

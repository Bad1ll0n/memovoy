// src/expenses/expenses.service.js
// Expense tracker durante a viagem.
//
// Decisões de design:
//   - Valores sempre em amount_cents na moeda original (evitar floats)
//   - Conversão para EUR em amount_eur_cents no momento do registo
//   - Taxa de câmbio guardada em exchange_rate para auditoria
//   - ECB rates em config (MVP: hardcoded atualizado diariamente via cron)
//   - RLS garante que só o dono e colaboradores do roteiro acedem
//
// Nota sobre taxas de câmbio:
//   Para o MVP, as taxas são estáticas no código e atualizadas por cron.
//   Quando Redis estiver disponível, mover para cache com TTL de 6h.

import { NotFoundError, ForbiddenError, ValidationError } from '../shared/errors/index.js'

// Taxas de câmbio fixas para MVP (EUR = 1.0 base)
// Em produção: buscar do BCE API com cache Redis TTL 6h
const ECB_RATES = {
  EUR: 1.0,
  USD: 1.08,
  GBP: 0.86,
  BRL: 5.42,
  JPY: 162.5,
  CHF: 0.97,
  CAD: 1.47,
  AUD: 1.64,
  CNY: 7.82,
  MXN: 18.4,
  ARS: 980.0,
  COP: 4250.0,
  CLP: 1010.0,
  PEN: 4.05,
}

export class ExpensesService {
  constructor(db) {
    this.db = db
  }

  // -------------------------------------------------------------------------
  // create — registar um gasto
  // -------------------------------------------------------------------------
  async create(userId, role, itineraryId, data) {
    const {
      amountCents,
      currency,
      category,
      description,
      dayId,
      receiptUrl,
      spentAt,
    } = data

    // Converter para EUR para totais — guardar taxa usada
    const { amountEurCents, exchangeRate } = this._toEur(amountCents, currency)

    return this.db.withUser(userId, role, async (sql) => {
      try {
        const [expense] = await sql`
          INSERT INTO trip_expenses (
            itinerary_id, user_id,
            amount_cents, currency,
            amount_eur_cents, exchange_rate,
            category, description,
            day_id, receipt_url, spent_at
          ) VALUES (
            ${itineraryId}, ${userId},
            ${amountCents}, ${currency.toUpperCase()},
            ${amountEurCents}, ${exchangeRate},
            ${category}, ${description ?? null},
            ${dayId ?? null}, ${receiptUrl ?? null},
            ${spentAt ? new Date(spentAt) : sql`NOW()`}
          )
          RETURNING
            id, itinerary_id, user_id,
            amount_cents, currency, amount_eur_cents, exchange_rate,
            category, description, day_id, receipt_url, spent_at
        `
        return expense
      } catch (err) {
        // Trigger fn_validate_expense_ownership lançou exceção
        if (err.message?.includes('não tem permissão')) {
          throw new ForbiddenError(err.message)
        }
        throw err
      }
    })
  }

  // -------------------------------------------------------------------------
  // list — listar gastos de um roteiro com totais por categoria
  // Uma query única devolve itens + totais agregados para a UI.
  // -------------------------------------------------------------------------
  async list(userId, role, itineraryId) {
    // Verificar acesso ao roteiro (dono ou colaborador)
    await this._assertAccess(itineraryId, userId)

    return this.db.withUser(userId, role, async (sql) => {
      // Gastos individuais com info do dia
      const items = await sql`
        SELECT
          e.id,
          e.amount_cents,
          e.currency,
          e.amount_eur_cents,
          e.exchange_rate,
          e.category,
          e.description,
          e.day_id,
          e.receipt_url,
          e.spent_at,
          e.user_id,
          u.username AS registered_by,
          -- Número do dia para display (ex: "Dia 3")
          d.day_number
        FROM trip_expenses e
        JOIN users u ON u.id = e.user_id
        LEFT JOIN itinerary_days d ON d.id = e.day_id
        WHERE e.itinerary_id = ${itineraryId}
        ORDER BY e.spent_at DESC
      `

      // Totais por categoria (query separada mais limpa que GROUPING SETS)
      const byCategory = await sql`
        SELECT
          category,
          SUM(amount_eur_cents)::integer AS total_eur_cents,
          COUNT(*)::integer              AS count
        FROM trip_expenses
        WHERE itinerary_id = ${itineraryId}
        GROUP BY category
        ORDER BY total_eur_cents DESC
      `

      // Total geral
      const [totals] = await sql`
        SELECT
          SUM(amount_eur_cents)::integer AS total_eur_cents,
          COUNT(*)::integer              AS count,
          array_agg(DISTINCT currency)  AS currencies_used
        FROM trip_expenses
        WHERE itinerary_id = ${itineraryId}
      `

      // Orçamento estimado vs real
      const [itinerary] = await sql`
        SELECT budget_per_day, duration_days, start_date
        FROM itineraries WHERE id = ${itineraryId}
      `

      const estimatedTotalEurCents = itinerary.budget_per_day
        ? itinerary.budget_per_day * itinerary.duration_days
        : null

      const daysElapsed = itinerary.start_date
        ? Math.max(
            1,
            Math.min(
              Math.ceil((Date.now() - new Date(itinerary.start_date)) / 86400000),
              itinerary.duration_days
            )
          )
        : null

      return {
        items,
        summary: {
          totalEurCents:          totals?.total_eur_cents ?? 0,
          count:                  totals?.count ?? 0,
          currenciesUsed:         totals?.currencies_used ?? [],
          byCategory,
          estimatedTotalEurCents,
          daysElapsed,
          // Ritmo actual: gasto / dias decorridos vs orçamento / dia
          dailyAvgEurCents: daysElapsed && totals?.total_eur_cents
            ? Math.round(totals.total_eur_cents / daysElapsed)
            : null,
          budgetPerDayEurCents: itinerary.budget_per_day ?? null,
          // Positivo = abaixo do orçamento, negativo = acima
          budgetRemainingEurCents: estimatedTotalEurCents != null && totals?.total_eur_cents != null
            ? estimatedTotalEurCents - totals.total_eur_cents
            : null,
        },
      }
    })
  }

  // -------------------------------------------------------------------------
  // update — actualizar descrição ou categoria de um gasto
  // Não permite alterar o valor — criar novo e apagar o anterior.
  // -------------------------------------------------------------------------
  async update(expenseId, userId, role, { category, description }) {
    return this.db.withUser(userId, role, async (sql) => {
      // Só o utilizador que registou o gasto pode editar
      const [expense] = await sql`
        SELECT id FROM trip_expenses
        WHERE id = ${expenseId} AND user_id = ${userId}
        LIMIT 1
      `
      if (!expense) throw new ForbiddenError('Não podes editar este gasto')

      const updates = {}
      if (category    !== undefined) updates.category    = category
      if (description !== undefined) updates.description = description

      if (Object.keys(updates).length === 0) return { ok: true }

      await sql`UPDATE trip_expenses SET ${sql(updates)} WHERE id = ${expenseId}`
      return { ok: true }
    })
  }

  // -------------------------------------------------------------------------
  // delete — apagar um gasto
  // Hard delete — não há necessidade de soft delete em gastos.
  // -------------------------------------------------------------------------
  async delete(expenseId, userId, role) {
    return this.db.withUser(userId, role, async (sql) => {
      const [result] = await sql`
        DELETE FROM trip_expenses
        WHERE id = ${expenseId} AND user_id = ${userId}
        RETURNING id
      `
      if (!result) throw new ForbiddenError('Não podes apagar este gasto')
      return { ok: true }
    })
  }

  // -------------------------------------------------------------------------
  // currentRates — devolver taxas de câmbio disponíveis
  // Permite à UI mostrar a taxa que será usada antes de o utilizador submeter.
  // -------------------------------------------------------------------------
  currentRates() {
    return Object.entries(ECB_RATES).map(([currency, rate]) => ({
      currency,
      rateToEur: rate === 1.0 ? 1.0 : parseFloat((1 / rate).toFixed(6)),
    }))
  }

  // -------------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------------

  _toEur(amountCents, currency) {
    const code = currency.toUpperCase()
    const rate = ECB_RATES[code]

    if (!rate) {
      // Moeda desconhecida — guardar sem conversão
      return { amountEurCents: null, exchangeRate: null }
    }

    if (code === 'EUR') {
      return { amountEurCents: amountCents, exchangeRate: 1.0 }
    }

    // 1 EUR = rate unidades da moeda → amountCents / rate = EUR cents
    const amountEurCents = Math.round(amountCents / rate)
    return {
      amountEurCents,
      exchangeRate: parseFloat((1 / rate).toFixed(6)),
    }
  }

  async _assertAccess(itineraryId, userId) {
    const { sql } = this.db
    const [access] = await sql`
      SELECT 1 FROM itineraries i
      WHERE i.id = ${itineraryId}
        AND i.deleted_at IS NULL
        AND (
          i.user_id = ${userId}
          OR EXISTS (
            SELECT 1 FROM itinerary_collaborators ic
            WHERE ic.itinerary_id = ${itineraryId}
              AND ic.user_id      = ${userId}
              AND ic.accepted_at  IS NOT NULL
          )
        )
      LIMIT 1
    `
    if (!access) throw new ForbiddenError('Não tens acesso a este roteiro')
  }
}

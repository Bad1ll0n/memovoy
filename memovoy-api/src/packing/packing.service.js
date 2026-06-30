// src/packing/packing.service.js
// Packing list gerada por IA e editável pelo utilizador.
//
// Fluxo:
//   1. Wizard IA já gera packing list e persiste em packing_lists
//   2. Este service: gerar para roteiros manuais, regenerar, editar, toggle
//
// A packing list é JSONB — edições são patches sobre a estrutura completa.
// Não normalizamos os itens em tabelas separadas: a lista é pequena (< 100 itens)
// e edições são sempre "substituir tudo" ou "toggle de um item".

import { NotFoundError, ForbiddenError, AppError } from '../shared/errors/index.js'
import { config }                                    from '../config/index.js'

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages'
const MODEL             = 'claude-sonnet-4-6'
const AI_TIMEOUT_MS     = 20_000

export class PackingService {
  constructor(db) {
    this.db = db
  }

  // -------------------------------------------------------------------------
  // get — buscar packing list de um roteiro
  // -------------------------------------------------------------------------
  async get(itineraryId, userId) {
    await this._assertOwner(itineraryId, userId)

    const { sql } = this.db
    const [list] = await sql`
      SELECT id, itinerary_id, items, weather_snapshot, generated_at, last_edited_at
      FROM packing_lists
      WHERE itinerary_id = ${itineraryId}
      LIMIT 1
    `

    if (!list) return null  // Ainda não gerada — UI mostra botão "Gerar"
    return list
  }

  // -------------------------------------------------------------------------
  // generate — gerar ou regenerar packing list com IA
  // Busca dados do roteiro + previsão do tempo + actividades para contextualizar.
  // -------------------------------------------------------------------------
  async generate(itineraryId, userId, role) {
    await this._assertOwner(itineraryId, userId)

    const { sql } = this.db

    // Buscar contexto completo do roteiro numa query
    const [itinerary] = await sql`
      SELECT
        i.destination_name, i.country_code, i.start_date, i.end_date,
        i.duration_days, i.group_type, i.transport_modes,
        -- Categorias únicas de actividades para contextualizar
        array_agg(DISTINCT a.category) FILTER (WHERE a.category IS NOT NULL) AS activity_categories,
        -- Preferências do utilizador
        up.travel_styles, upr.dietary_restrictions
      FROM itineraries i
      LEFT JOIN itinerary_days d    ON d.itinerary_id = i.id
      LEFT JOIN itinerary_activities a ON a.day_id = d.id AND a.deleted_at IS NULL
      JOIN user_profiles up          ON up.user_id = i.user_id
      LEFT JOIN user_preferences upr ON upr.user_id = i.user_id
      WHERE i.id = ${itineraryId} AND i.deleted_at IS NULL
      GROUP BY i.id, up.user_id, upr.user_id
    `

    if (!itinerary) throw new NotFoundError('Roteiro')

    // Chamar IA
    const packingList = await this._callClaudeForPackingList(itinerary)

    // Persistir (upsert — pode já existir se veio do wizard)
    return this.db.withUser(userId, role, async (tx) => {
      const [list] = await tx`
        INSERT INTO packing_lists (itinerary_id, items, generated_at)
        VALUES (
          ${itineraryId},
          ${JSON.stringify(packingList)},
          NOW()
        )
        ON CONFLICT (itinerary_id) DO UPDATE SET
          items        = EXCLUDED.items,
          generated_at = NOW(),
          last_edited_at = NULL
        RETURNING id, itinerary_id, items, generated_at, last_edited_at
      `
      return list
    })
  }

  // -------------------------------------------------------------------------
  // toggleItem — marcar/desmarcar um item (checked = true/false)
  // Identifica o item por categoria + nome — evita IDs separados para itens.
  // -------------------------------------------------------------------------
  async toggleItem(itineraryId, userId, role, { categoryName, itemName, checked }) {
    await this._assertOwner(itineraryId, userId)

    return this.db.withUser(userId, role, async (sql) => {
      const [list] = await sql`
        SELECT id, items FROM packing_lists WHERE itinerary_id = ${itineraryId} LIMIT 1
      `
      if (!list) throw new NotFoundError('Packing list')

      const parsed = typeof list.items === 'string' ? JSON.parse(list.items) : list.items
      let found = false

      // Mutação localizada — percorrer apenas a categoria alvo
      for (const cat of parsed.categories ?? []) {
        if (cat.name !== categoryName) continue
        for (const item of cat.items ?? []) {
          if (item.item === itemName) {
            item.checked = checked
            found = true
            break
          }
        }
        if (found) break
      }

      if (!found) throw new NotFoundError('Item da packing list')

      const [updated] = await sql`
        UPDATE packing_lists
        SET items = ${JSON.stringify(parsed)}, last_edited_at = NOW()
        WHERE itinerary_id = ${itineraryId}
        RETURNING id, items, last_edited_at
      `
      return updated
    })
  }

  // -------------------------------------------------------------------------
  // addItem — adicionar item manualmente a uma categoria existente ou nova
  // -------------------------------------------------------------------------
  async addItem(itineraryId, userId, role, { categoryName, item }) {
    await this._assertOwner(itineraryId, userId)

    return this.db.withUser(userId, role, async (sql) => {
      const [list] = await sql`
        SELECT id, items FROM packing_lists WHERE itinerary_id = ${itineraryId} LIMIT 1
      `
      if (!list) throw new NotFoundError('Packing list')

      const parsed   = typeof list.items === 'string' ? JSON.parse(list.items) : list.items
      const cats     = parsed.categories ?? []
      const category = cats.find(c => c.name === categoryName)

      const newItem = {
        item:     item.item,
        reason:   item.reason ?? 'Adicionado manualmente',
        priority: item.priority ?? 'recommended',
        checked:  false,
      }

      if (category) {
        category.items.push(newItem)
      } else {
        // Criar categoria nova com o item
        cats.push({ name: categoryName, icon: '📦', items: [newItem] })
        parsed.categories = cats
      }

      const [updated] = await sql`
        UPDATE packing_lists
        SET items = ${JSON.stringify(parsed)}, last_edited_at = NOW()
        WHERE itinerary_id = ${itineraryId}
        RETURNING id, items, last_edited_at
      `
      return updated
    })
  }

  // -------------------------------------------------------------------------
  // removeItem — remover item da lista
  // -------------------------------------------------------------------------
  async removeItem(itineraryId, userId, role, { categoryName, itemName }) {
    await this._assertOwner(itineraryId, userId)

    return this.db.withUser(userId, role, async (sql) => {
      const [list] = await sql`
        SELECT id, items FROM packing_lists WHERE itinerary_id = ${itineraryId} LIMIT 1
      `
      if (!list) throw new NotFoundError('Packing list')

      const parsed = typeof list.items === 'string' ? JSON.parse(list.items) : list.items
      let removed  = false

      for (const cat of parsed.categories ?? []) {
        if (cat.name !== categoryName) continue
        const before = cat.items.length
        cat.items = cat.items.filter(i => i.item !== itemName)
        removed   = cat.items.length < before
        break
      }

      if (!removed) throw new NotFoundError('Item da packing list')

      const [updated] = await sql`
        UPDATE packing_lists
        SET items = ${JSON.stringify(parsed)}, last_edited_at = NOW()
        WHERE itinerary_id = ${itineraryId}
        RETURNING id, items, last_edited_at
      `
      return updated
    })
  }

  // -------------------------------------------------------------------------
  // _callClaudeForPackingList — chamada IA isolada
  // -------------------------------------------------------------------------
  async _callClaudeForPackingList(itinerary) {
    const prompt = this._buildPackingPrompt(itinerary)

    const controller = new AbortController()
    const timer      = setTimeout(() => controller.abort(), AI_TIMEOUT_MS)

    let response
    try {
      response = await fetch(ANTHROPIC_API_URL, {
        method:  'POST',
        headers: {
          'Content-Type':      'application/json',
          'x-api-key':         config.anthropic.apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model:      MODEL,
          max_tokens: 2048,
          messages:   [{ role: 'user', content: prompt }],
        }),
        signal: controller.signal,
      })
    } finally {
      clearTimeout(timer)
    }

    if (!response.ok) {
      throw new AppError(`Packing list IA erro ${response.status}`, 502, 'AI_UPSTREAM_ERROR')
    }

    const data      = await response.json()
    const textBlock = data.content?.find(b => b.type === 'text')
    if (!textBlock?.text) {
      throw new AppError('Resposta da IA sem conteúdo', 502, 'AI_EMPTY_RESPONSE')
    }

    return this._parsePackingResponse(textBlock.text)
  }

  _buildPackingPrompt(itinerary) {
    const {
      destination_name, country_code, start_date, end_date, duration_days,
      group_type, transport_modes, activity_categories, dietary_restrictions,
    } = itinerary

    // Inferir época do ano para sugestões de roupa
    const month   = new Date(start_date).getMonth() + 1
    const isNH    = ['PT','ES','FR','DE','IT','GB','US','CA'].includes(country_code)
    const isSummer = isNH ? month >= 6 && month <= 8 : month >= 12 || month <= 2

    return `Generate a packing list for this trip. Respond ONLY with valid JSON, no markdown.

Trip details:
- Destination: ${destination_name} (${country_code})
- Dates: ${start_date} to ${end_date} (${duration_days} days)
- Group type: ${group_type}
- Transport: ${(transport_modes || []).join(', ')}
- Activities include: ${(activity_categories || []).join(', ')}
- Dietary restrictions: ${(dietary_restrictions || []).join(', ') || 'none'}
- Season: ${isSummer ? 'summer/warm' : 'winter/cool or shoulder season'}

Return this exact structure:
{
  "categories": [
    {
      "name": "Category name",
      "icon": "emoji",
      "items": [
        {
          "item": "Item name",
          "reason": "Why this is needed for THIS trip specifically",
          "priority": "essential" | "recommended" | "optional",
          "checked": false
        }
      ]
    }
  ]
}

Rules:
- Maximum 6 categories, 8 items each
- Only include items relevant to THIS specific trip
- reason must reference the trip context (e.g. "temples require covered shoulders", "rain forecast days 3-4")
- Always include: documents category (passport, insurance), electronics (adapters for ${country_code})
- Never include generic advice that applies to every trip`
  }

  _parsePackingResponse(rawText) {
    let parsed
    try {
      const cleaned = rawText.replace(/^```(?:json)?\s*/m, '').replace(/\s*```$/m, '').trim()
      parsed = JSON.parse(cleaned)
    } catch {
      throw new AppError('Packing list IA retornou JSON inválido', 502, 'AI_PARSE_ERROR')
    }

    if (!Array.isArray(parsed.categories) || parsed.categories.length === 0) {
      throw new AppError('Packing list IA: estrutura inválida', 502, 'AI_PARSE_ERROR')
    }

    // Sanitizar — garantir que todos os campos estão presentes e são strings
    for (const cat of parsed.categories) {
      cat.name  = String(cat.name  ?? 'Geral').slice(0, 60)
      cat.icon  = String(cat.icon  ?? '📦').slice(0, 5)
      cat.items = (cat.items ?? []).map(i => ({
        item:     String(i.item     ?? '').slice(0, 100),
        reason:   String(i.reason   ?? '').slice(0, 200),
        priority: ['essential','recommended','optional'].includes(i.priority)
          ? i.priority
          : 'recommended',
        checked: false,
      })).filter(i => i.item.length > 0)
    }

    return parsed
  }

  async _assertOwner(itineraryId, userId) {
    const { sql } = this.db
    const [row]   = await sql`
      SELECT id FROM itineraries
      WHERE id = ${itineraryId} AND user_id = ${userId} AND deleted_at IS NULL
      LIMIT 1
    `
    if (!row) throw new ForbiddenError('Não tens permissão para aceder a esta packing list')
  }
}

// src/ai/wizard.service.js
// Orquestra o wizard de 6 etapas: valida, chama Claude, persiste atomicamente.
//
// Fallback a 3 níveis:
//   1. claude-sonnet-4-6 em tempo real  (< 20s)
//   2. Resultado em cache (geração anterior para destino+datas semelhantes)
//   3. Modo manual: devolve estrutura vazia com instruções
//
// Assumption: ANTHROPIC_API_KEY está em variável de ambiente.
// Nunca está no código — validada em config/index.js ao arranque.

import { buildItineraryPrompt, parseItineraryResponse } from './prompt-builder.js'
import { ValidationError, AppError }                     from '../shared/errors/index.js'
import { config }                                         from '../config/index.js'

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages'
const MODEL             = 'claude-sonnet-4-6'
const MAX_TOKENS        = 8192
// Timeout da chamada à IA: 25s (SLO = 20s, buffer de 5s para overhead de rede)
const AI_TIMEOUT_MS     = 25_000

export class WizardService {
  constructor(db) {
    this.db = db
  }

  // -------------------------------------------------------------------------
  // generate
  // Ponto de entrada do wizard. Recebe wizardAnswers já validado por Zod.
  // Devolve { itinerary, generationId, usedFallback, fallbackLevel }.
  // -------------------------------------------------------------------------
  async generate(userId, role, wizardAnswers) {
    // 1. Seleccionar a versão de prompt activa (A/B testing)
    const promptVersion = await this._getActivePromptVersion()

    // 2. Registar a tentativa de geração (antes de chamar a IA)
    //    Permite rastrear falhas e calcular taxa de sucesso por versão.
    const generationId = await this._createGenerationRecord(userId, wizardAnswers, promptVersion)

    let result
    let usedFallback  = false
    let fallbackLevel = 1

    // Nível 1: chamada em tempo real à IA
    try {
      result = await this._callClaudeWithTimeout(wizardAnswers, promptVersion)
    } catch (aiError) {
      // Log estruturado para diagnosticar em produção
      const log = { err: aiError, userId, generationId, destination: wizardAnswers.destination?.name }
      if (aiError.name === 'AbortError' || aiError.message?.includes('timeout')) {
        console.warn({ ...log }, 'AI timeout — a tentar cache')
      } else {
        console.error({ ...log }, 'AI error — a tentar cache')
      }

      // Nível 2: cache de gerações anteriores para o mesmo destino
      result = await this._findCachedGeneration(wizardAnswers)
      if (result) {
        usedFallback  = true
        fallbackLevel = 2
      }
    }

    // Nível 3: modo manual se níveis 1 e 2 falharam
    if (!result) {
      result        = this._buildManualFallback(wizardAnswers)
      usedFallback  = true
      fallbackLevel = 3
    }

    // 3. Persistir roteiro atomicamente
    const itinerary = await this._persistItinerary(userId, role, wizardAnswers, result, generationId)

    // 4. Actualizar registo de geração com resultado
    await this._finaliseGenerationRecord(generationId, {
      itineraryId:    itinerary.id,
      tokensUsed:     result.tokensUsed ?? null,
      durationMs:     result.durationMs ?? null,
      usedFallback,
      fallbackLevel,
    })

    return { itinerary, generationId, usedFallback, fallbackLevel }
  }

  // -------------------------------------------------------------------------
  // _callClaudeWithTimeout
  // Chama a API da Anthropic com AbortController para timeout controlado.
  // Lança erro se a resposta não for JSON válido ou estruturalmente inválida.
  // -------------------------------------------------------------------------
  async _callClaudeWithTimeout(wizardAnswers, promptVersion) {
    const { system, user } = buildItineraryPrompt(wizardAnswers)

    // Sistema de prompt: usar o system prompt do A/B testing como prefixo
    const fullSystem = promptVersion
      ? `${promptVersion.system_prompt}\n\n${system}`
      : system

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), AI_TIMEOUT_MS)

    const startMs = Date.now()
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
          max_tokens: MAX_TOKENS,
          system:     fullSystem,
          messages:   [{ role: 'user', content: user }],
        }),
        signal: controller.signal,
      })
    } finally {
      clearTimeout(timer)
    }

    const durationMs = Date.now() - startMs

    if (!response.ok) {
      const body = await response.text().catch(() => '(sem body)')
      // Nunca expor o body completo ao cliente — pode conter detalhes internos da API
      throw new AppError(`Anthropic API erro ${response.status}`, 502, 'AI_UPSTREAM_ERROR')
    }

    const data = await response.json()

    // Extrair texto da resposta
    const textBlock = data.content?.find(b => b.type === 'text')
    if (!textBlock?.text) {
      throw new AppError('Resposta da IA sem conteúdo de texto', 502, 'AI_EMPTY_RESPONSE')
    }

    // Validar e normalizar (lança se JSON inválido ou estrutura errada)
    const parsed = parseItineraryResponse(textBlock.text)

    return {
      ...parsed,
      tokensUsed: data.usage?.input_tokens + data.usage?.output_tokens,
      durationMs,
    }
  }

  // -------------------------------------------------------------------------
  // _persistItinerary
  // Persiste roteiro + dias + actividades numa única transacção atómica.
  // Se qualquer INSERT falhar, tudo é revertido — nunca ficamos com um roteiro
  // parcial na BD.
  // -------------------------------------------------------------------------
  async _persistItinerary(userId, role, wizardAnswers, aiResult, generationId) {
    const { destination, startDate, endDate, groupType, transportModes,
            budgetPerDay, travelStyles, visibility = 'public' } = wizardAnswers

    return this.db.withUser(userId, role, async (sql) => {
      // 1. Criar o roteiro
      const [itinerary] = await sql`
        INSERT INTO itineraries (
          user_id, title, destination_name, destination_geo,
          country_code, start_date, end_date, group_type,
          transport_modes, budget_per_day, travel_styles,
          visibility, status, ai_generated, ai_generation_id
        ) VALUES (
          ${userId},
          ${aiResult.title},
          ${destination.name},
          ${destination.lat != null && destination.lng != null
            ? sql`ST_SetSRID(ST_MakePoint(${destination.lng}, ${destination.lat}), 4326)::geography`
            : null},
          ${destination.countryCode.toUpperCase()},
          ${startDate}, ${endDate},
          ${groupType},
          ${transportModes ?? []},
          ${budgetPerDay ?? null},
          ${travelStyles ?? []},
          ${visibility},
          'draft',
          true,
          ${generationId}
        )
        RETURNING id, title, destination_name, country_code,
                  start_date, end_date, duration_days,
                  group_type, status, ai_generated, created_at
      `

      // 2. Criar dias em batch (todos de uma vez)
      const dayRows = aiResult.days.map(d => ({
        itinerary_id: itinerary.id,
        day_number:   d.day_number,
        date:         d.date,
        theme:        d.theme ?? null,
        notes:        d.notes ?? null,
      }))

      const insertedDays = await sql`INSERT INTO itinerary_days ${sql(dayRows)} RETURNING id, day_number`

      // Mapa day_number → BD id para associar actividades
      const dayIdByNumber = Object.fromEntries(insertedDays.map(d => [d.day_number, d.id]))

      // 3. Criar actividades em batch (todas de uma vez, sem loop com queries)
      const activityRows = []
      for (const day of aiResult.days) {
        const dayId = dayIdByNumber[day.day_number]
        if (!dayId) continue

        for (const act of day.activities) {
          activityRows.push({
            day_id:           dayId,
            position:         act.position,
            name:             act.name,
            category:         act.category ?? null,
            // Coordenadas geo não podem ir em batch literal com ST_MakePoint
            // — são inseridas como null aqui e actualizadas abaixo se necessário
            location:         null,
            address:          act.address ?? null,
            start_time:       act.start_time ?? null,
            duration_minutes: act.duration_minutes ?? null,
            notes:            act.notes ?? null,
            booking_url:      act.booking_url ?? null,
            price_estimate:   act.price_estimate ?? null,
            external_id:      act.external_id ?? null,
            external_source:  act.external_source ?? null,
            ai_suggested:     true,
            ai_warning:       act.ai_warning ?? null,
          })
        }
      }

      if (activityRows.length > 0) {
        await sql`INSERT INTO itinerary_activities ${sql(activityRows)}`

        // Actualizar coordenadas geo em batch para as actividades que as têm
        const withCoords = aiResult.days
          .flatMap(d => d.activities.filter(a => a.lat != null && a.lng != null)
            .map(a => ({ ...a, dayId: dayIdByNumber[d.day_number] })))

        for (const act of withCoords) {
          await sql`
            UPDATE itinerary_activities
            SET location = ST_SetSRID(ST_MakePoint(${act.lng}, ${act.lat}), 4326)::geography
            WHERE day_id = ${act.dayId}
              AND position = ${act.position}
              AND name = ${act.name}
          `
        }
      }

      // 4. Guardar packing list se a IA a devolveu
      if (aiResult.packing_list?.categories?.length > 0) {
        await sql`
          INSERT INTO packing_lists (itinerary_id, items, generated_at)
          VALUES (${itinerary.id}, ${JSON.stringify(aiResult.packing_list)}, NOW())
          ON CONFLICT (itinerary_id) DO UPDATE SET items = EXCLUDED.items
        `
      }

      return {
        ...itinerary,
        summary:  aiResult.summary,
        warnings: aiResult.warnings ?? [],
        daysCount: insertedDays.length,
        activitiesCount: activityRows.length,
      }
    })
  }

  // -------------------------------------------------------------------------
  // _getActivePromptVersion
  // Selecciona a versão de prompt para este request baseado em traffic_percentage.
  // Algoritmo: hash(NOW() em segundos) % 100 < traffic_percentage.
  // Não usa userId para não criar experiências inconsistentes para o mesmo user.
  // Retorna null se não houver versões activas (usa apenas o prompt base).
  // -------------------------------------------------------------------------
  async _getActivePromptVersion() {
    const { sql } = this.db
    const versions = await sql`
      SELECT id, version_name, system_prompt, traffic_percentage
      FROM prompt_versions
      WHERE is_active = true
      ORDER BY traffic_percentage DESC
    `
    if (versions.length === 0) return null

    // Distribuição determinística por segundo (não por request — evita hot-path lento)
    const bucket = Math.floor(Date.now() / 1000) % 100
    let cumulative = 0
    for (const v of versions) {
      cumulative += v.traffic_percentage
      if (bucket < cumulative) return v
    }
    return versions[0] // fallback à primeira
  }

  // -------------------------------------------------------------------------
  // _findCachedGeneration
  // Procura uma geração anterior bem-sucedida para o mesmo destino e duração.
  // Critérios: mesmo country_code + mesmo número de dias + < 30 dias de idade.
  // Não usa datas exactas — uma geração para Tokyo de 7 dias serve qualquer
  // período de 7 dias em Tokyo.
  // -------------------------------------------------------------------------
  async _findCachedGeneration(wizardAnswers) {
    const { sql } = this.db
    const durationDays = daysBetween(wizardAnswers.startDate, wizardAnswers.endDate)

    const [cached] = await sql`
      SELECT ag.id, i.title, i.id AS itinerary_id
      FROM ai_generations ag
      JOIN itineraries i ON i.id = ag.itinerary_id
      WHERE
        i.deleted_at IS NULL
        AND i.country_code = ${wizardAnswers.destination.countryCode.toUpperCase()}
        AND i.duration_days = ${durationDays}
        AND i.group_type = ${wizardAnswers.groupType}
        AND ag.used_fallback = false
        AND ag.created_at > NOW() - INTERVAL '30 days'
      ORDER BY ag.created_at DESC
      LIMIT 1
    `

    if (!cached) return null

    // Buscar a estrutura completa do roteiro cacheado
    const days = await sql`
      SELECT d.day_number, d.theme, d.notes,
        json_agg(
          json_build_object(
            'position', a.position, 'name', a.name, 'category', a.category,
            'address', a.address, 'start_time', a.start_time,
            'duration_minutes', a.duration_minutes, 'notes', a.notes,
            'price_estimate', a.price_estimate, 'ai_warning', a.ai_warning
          ) ORDER BY a.position
        ) AS activities
      FROM itinerary_days d
      LEFT JOIN itinerary_activities a ON a.day_id = d.id AND a.deleted_at IS NULL
      WHERE d.itinerary_id = ${cached.itinerary_id}
      GROUP BY d.day_number, d.theme, d.notes
      ORDER BY d.day_number
    `

    // Adaptar datas para as novas datas do request
    const adaptedDays = days.map((d, i) => {
      const date = new Date(wizardAnswers.startDate)
      date.setDate(date.getDate() + i)
      return { ...d, date: date.toISOString().split('T')[0] }
    })

    return {
      title:       `${wizardAnswers.destination.name} — ${durationDays} dias`,
      summary:     `Roteiro baseado em geração anterior para ${wizardAnswers.destination.name}.`,
      warnings:    ['Este roteiro foi gerado a partir de uma viagem semelhante. Verifica datas e disponibilidade.'],
      days:        adaptedDays,
      tokensUsed:  null,
      durationMs:  null,
      fromCache:   true,
    }
  }

  // -------------------------------------------------------------------------
  // _buildManualFallback
  // Último recurso: devolve estrutura vazia com um dia placeholder por cada dia
  // da viagem. O utilizador pode preencher manualmente.
  // -------------------------------------------------------------------------
  _buildManualFallback(wizardAnswers) {
    const durationDays = daysBetween(wizardAnswers.startDate, wizardAnswers.endDate)
    const days = Array.from({ length: durationDays }, (_, i) => {
      const date = new Date(wizardAnswers.startDate)
      date.setDate(date.getDate() + i)
      return {
        day_number: i + 1,
        date:       date.toISOString().split('T')[0],
        theme:      `Dia ${i + 1} em ${wizardAnswers.destination.name}`,
        notes:      'Roteiro gerado manualmente — adiciona as tuas actividades',
        activities: [],
      }
    })

    return {
      title:    `${wizardAnswers.destination.name} — ${durationDays} dias`,
      summary:  'A geração automática falhou. O roteiro foi criado em modo manual.',
      warnings: ['A geração de roteiro por IA não estava disponível. Adiciona as tuas actividades manualmente.'],
      days,
      tokensUsed: null,
      durationMs: null,
      isManualFallback: true,
    }
  }

  // -------------------------------------------------------------------------
  // _createGenerationRecord
  // Cria o registo na BD ANTES de chamar a IA.
  // Permite rastrear tentativas falhadas e medir SLOs.
  // -------------------------------------------------------------------------
  async _createGenerationRecord(userId, wizardAnswers, promptVersion) {
    const { sql } = this.db
    const [gen] = await sql`
      INSERT INTO ai_generations (
        user_id, prompt_version_id, wizard_answers, model_used, used_fallback
      ) VALUES (
        ${userId},
        ${promptVersion?.id ?? null},
        ${JSON.stringify(wizardAnswers)},
        ${MODEL},
        false
      )
      RETURNING id
    `
    return gen.id
  }

  // -------------------------------------------------------------------------
  // _finaliseGenerationRecord
  // Actualiza o registo de geração com o resultado final.
  // Chamado após persistência bem-sucedida.
  // -------------------------------------------------------------------------
  async _finaliseGenerationRecord(generationId, { itineraryId, tokensUsed, durationMs, usedFallback, fallbackLevel }) {
    const { sql } = this.db
    await sql`
      UPDATE ai_generations
      SET
        itinerary_id   = ${itineraryId},
        tokens_used    = ${tokensUsed ?? null},
        duration_ms    = ${durationMs ?? null},
        used_fallback  = ${usedFallback},
        fallback_level = ${fallbackLevel}
      WHERE id = ${generationId}
    `
  }
}

// ---------------------------------------------------------------------------
// Utilitário local
// ---------------------------------------------------------------------------
function daysBetween(start, end) {
  return Math.round((new Date(end) - new Date(start)) / 86400000) + 1
}

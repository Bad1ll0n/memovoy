// src/ai/prompt-builder.js
// Transforma as respostas do wizard de 6 etapas num prompt preciso para Claude.
// Separado do service para ser testável isoladamente.

// ---------------------------------------------------------------------------
// buildItineraryPrompt
// Recebe wizardAnswers validado e devolve { system, user } prontos a enviar.
// Assumption: todas as propriedades de wizardAnswers já foram validadas por Zod.
// ---------------------------------------------------------------------------
export function buildItineraryPrompt(answers) {
  const {
    destination,        // { name, countryCode, lat?, lng? }
    startDate,          // 'YYYY-MM-DD'
    endDate,            // 'YYYY-MM-DD'
    groupType,          // 'solo' | 'couple' | 'friends' | 'family'
    groupSize,          // número (relevante para família/amigos)
    transportModes,     // string[]
    budgetPerDay,       // number (EUR cents) | null
    travelStyles,       // string[]
    dietaryRestrictions,// string[]
    mustSeeAttractions, // string[] (max 5)
    avoidCategories,    // string[] — o que NÃO incluir
    pacePreference,     // 'relaxed' | 'moderate' | 'intensive'
    accommodationType,  // 'hotel' | 'airbnb' | 'hostel' | 'boutique' | null
    language,           // 'pt-PT' | 'pt-BR' | 'en' — língua de resposta
  } = answers

  const durationDays = daysBetween(startDate, endDate)
  const budgetText   = budgetPerDay
    ? `€${Math.round(budgetPerDay / 100)}/dia`
    : 'sem orçamento definido'

  const system = `You are MemoVoy AI, an expert travel itinerary planner. You create detailed, practical, realistic travel itineraries.

CRITICAL RULES:
1. Respond ONLY with a valid JSON object — no markdown, no preamble, no explanation outside JSON.
2. Every activity must have realistic opening hours checked against the destination.
3. Walking distances between consecutive activities must be achievable in the time allocated.
4. Warn explicitly (ai_warning field) about: closures on specific days, advance booking required, long queues, seasonal unavailability.
5. Restaurants must match dietary restrictions provided.
6. Never schedule more than 5 substantive activities per day for 'relaxed' pace, 7 for 'moderate', 9 for 'intensive'.
7. Include real addresses when known; leave null otherwise — never invent addresses.
8. price_estimate is in EUR cents (integer). Use 0 for free, null for unknown.

RESPONSE SCHEMA (strict):
{
  "title": string,
  "summary": string (2-3 sentences overview),
  "warnings": string[] (top-level warnings about the trip),
  "days": [
    {
      "day_number": integer,
      "date": "YYYY-MM-DD",
      "theme": string,
      "notes": string | null,
      "activities": [
        {
          "position": integer,
          "name": string,
          "category": "attraction" | "restaurant" | "transport" | "hotel" | "activity" | "break",
          "address": string | null,
          "lat": number | null,
          "lng": number | null,
          "start_time": "HH:MM" | null,
          "duration_minutes": integer | null,
          "notes": string | null,
          "booking_url": string | null,
          "price_estimate": integer | null,
          "ai_warning": string | null,
          "external_id": string | null,
          "external_source": "google_places" | null
        }
      ]
    }
  ],
  "packing_list": {
    "categories": [
      {
        "name": string,
        "icon": string (emoji),
        "items": [
          {
            "item": string,
            "reason": string,
            "priority": "essential" | "recommended" | "optional",
            "checked": false
          }
        ]
      }
    ]
  },
  "carbon_estimate": {
    "total_kg": number,
    "transport_kg": number,
    "accommodation_kg": number,
    "notes": string
  }
}`

  const transportText = transportModes.length > 0
    ? transportModes.join(', ')
    : 'transporte público'

  const stylesText = travelStyles.length > 0
    ? travelStyles.join(', ')
    : 'geral'

  const avoidText = avoidCategories.length > 0
    ? `\nEvitar categorias: ${avoidCategories.join(', ')}.`
    : ''

  const mustSeeText = mustSeeAttractions.length > 0
    ? `\nObrigatório incluir: ${mustSeeAttractions.join(', ')}.`
    : ''

  const dietaryText = dietaryRestrictions.length > 0
    ? `\nRestrições alimentares: ${dietaryRestrictions.join(', ')}.`
    : ''

  const groupText = groupType === 'family'
    ? `família com ${groupSize} pessoas`
    : groupType === 'friends'
    ? `grupo de ${groupSize} amigos`
    : groupType === 'couple'
    ? 'casal'
    : 'viajante solo'

  const responseLanguageInstruction = language === 'pt-BR'
    ? 'Respond in Brazilian Portuguese (pt-BR).'
    : language === 'en'
    ? 'Respond in English.'
    : 'Respond in European Portuguese (pt-PT).'

  const user = `${responseLanguageInstruction}

Plan a ${durationDays}-day trip to ${destination.name} (${destination.countryCode}).
Dates: ${startDate} to ${endDate}.
Group: ${groupText}.
Transport: ${transportText}.
Budget: ${budgetText}.
Travel styles: ${stylesText}.
Pace: ${pacePreference}.
Accommodation type: ${accommodationType ?? 'any'}.${mustSeeText}${avoidText}${dietaryText}

Generate the complete itinerary following the JSON schema exactly.`

  return { system, user }
}

// ---------------------------------------------------------------------------
// parseItineraryResponse
// Valida e normaliza a resposta da IA antes de persistir.
// Lança erro explícito se a estrutura for inválida — nunca persiste lixo.
// ---------------------------------------------------------------------------
export function parseItineraryResponse(rawText) {
  let parsed
  try {
    // Remover blocos de código markdown caso a IA os inclua (defensive)
    const cleaned = rawText.replace(/^```(?:json)?\s*/m, '').replace(/\s*```$/m, '').trim()
    parsed = JSON.parse(cleaned)
  } catch {
    throw new Error('IA retornou JSON inválido')
  }

  // Validações estruturais mínimas — não confiamos cegamente na IA
  if (typeof parsed.title !== 'string' || !parsed.title.trim()) {
    throw new Error('Resposta IA: title em falta')
  }
  if (!Array.isArray(parsed.days) || parsed.days.length === 0) {
    throw new Error('Resposta IA: days em falta ou vazio')
  }

  for (const day of parsed.days) {
    if (typeof day.day_number !== 'number') throw new Error(`Resposta IA: day_number inválido no dia ${JSON.stringify(day)}`)
    if (!Array.isArray(day.activities)) throw new Error(`Resposta IA: activities em falta no dia ${day.day_number}`)

    for (const act of day.activities) {
      if (typeof act.position !== 'number') throw new Error(`Resposta IA: position inválida na actividade ${JSON.stringify(act)}`)
      if (typeof act.name !== 'string' || !act.name.trim()) throw new Error(`Resposta IA: nome em falta na actividade`)

      // Sanitizar campos numéricos — IA pode devolver strings
      act.price_estimate    = toNullableInt(act.price_estimate)
      act.duration_minutes  = toNullableInt(act.duration_minutes)
      act.lat               = toNullableFloat(act.lat)
      act.lng               = toNullableFloat(act.lng)

      // Garantir categoria válida
      const validCategories = ['attraction','restaurant','transport','hotel','activity','break']
      if (act.category && !validCategories.includes(act.category)) act.category = 'activity'

      // Truncar strings longas para caber na BD
      act.name     = truncate(act.name, 200)
      act.address  = truncate(act.address, 500)
      act.notes    = truncate(act.notes, 2000)
      act.ai_warning = truncate(act.ai_warning, 500)
    }
  }

  return parsed
}

// ---------------------------------------------------------------------------
// Utilitários privados
// ---------------------------------------------------------------------------

function daysBetween(start, end) {
  const ms = new Date(end) - new Date(start)
  return Math.round(ms / 86400000) + 1
}

function toNullableInt(val) {
  if (val === null || val === undefined) return null
  const n = parseInt(val, 10)
  return isNaN(n) ? null : n
}

function toNullableFloat(val) {
  if (val === null || val === undefined) return null
  const n = parseFloat(val)
  return isNaN(n) ? null : n
}

function truncate(str, max) {
  if (!str) return null
  return str.length > max ? str.slice(0, max) : str
}

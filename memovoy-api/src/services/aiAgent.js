import crypto from 'crypto'
import OpenAI from 'openai'
import { query } from '../db/pool.js'

// Strip HTML tags and null-bytes from any string that comes out of the LLM
export function sanitizeText(value) {
  if (typeof value !== 'string') return value
  return value
    .replace(/<[^>]*>/g, '')      // strip HTML tags
    .replace(/\0/g, '')      // strip null bytes
    .trim()
}

// Recursively sanitize all string fields in an object/array
export function sanitizeOutput(obj) {
  if (Array.isArray(obj)) return obj.map(sanitizeOutput)
  if (obj !== null && typeof obj === 'object') {
    const out = {}
    for (const [k, v] of Object.entries(obj)) out[k] = sanitizeOutput(v)
    return out
  }
  return sanitizeText(obj)
}

// Cliente construido a pedido, nao no import.
//
// Duas razoes. Uma: importar este modulo deixa de exigir GROQ_API_KEY, o que
// tornava impossivel carrega-lo em testes sem uma chave falsa. Outra: permite
// substitui-lo por um duplo, que e a unica forma de testar os agentes sem
// chamar a API a serio.
let clienteLlm = null

function obterCliente() {
  if (clienteLlm === null) {
    clienteLlm = new OpenAI({
      apiKey:     process.env.GROQ_API_KEY,
      baseURL:    'https://api.groq.com/openai/v1',
      timeout:    30_000,
      maxRetries: 0,
    })
  }
  return clienteLlm
}

/**
 * Substitui o cliente do LLM. Passar null repoe o real na proxima chamada.
 * Existe para os testes; nao usar em codigo de producao.
 * @param {{ chat: { completions: { create: Function } } } | null} cliente
 */
export function definirClienteLlm(cliente) {
  clienteLlm = cliente
}
const MODEL       = 'llama-3.3-70b-versatile'
const VISION_MODEL = 'meta-llama/llama-4-scout-17b-16e-instruct'
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000 // 7 days

// Language rule appended to every system prompt — ensures Portuguese output regardless of input
const PT_RULE = '\nIMPORTANT: All descriptive text in your JSON response (names, descriptions, themes, tips, reasoning, why, local phrases translations, etc.) must be written in European Portuguese (Portugal). Exceptions: geoName must stay in English for geocoding; currency ISO codes and type enum values stay as-is.'

// ── Cache helpers ─────────────────────────────────────────────────────────────

function cacheKey(obj) {
  return crypto.createHash('sha256').update(JSON.stringify(obj)).digest('hex').slice(0, 64)
}

async function getCache(key) {
  const { rows } = await query(
    'SELECT response FROM ai_cache WHERE cache_key = $1 AND expires_at > NOW()',
    [key],
  )
  return rows[0]?.response ?? null
}

async function setCache(key, response) {
  const expires = new Date(Date.now() + CACHE_TTL_MS)
  await query(
    `INSERT INTO ai_cache (cache_key, response, expires_at)
     VALUES ($1, $2, $3)
     ON CONFLICT (cache_key) DO UPDATE SET response = $2, expires_at = $3, created_at = NOW()`,
    [key, JSON.stringify(response), expires],
  )
}

// ── OpenAI call with 1 automatic retry ───────────────────────────────────────

async function callOpenAI(messages, maxTokens = 1000, { model = MODEL, temperature } = {}) {
  const params = {
    model,
    response_format: { type: 'json_object' },
    messages,
    max_tokens: maxTokens,
  }
  if (temperature !== undefined) params.temperature = temperature

  async function run() {
    const completion = await obterCliente().chat.completions.create(params, {
      signal: AbortSignal.timeout(25_000),
    })
    if (completion.usage) {
      console.info('[ai] tokens', {
        model:      params.model,
        prompt:     completion.usage.prompt_tokens,
        completion: completion.usage.completion_tokens,
        total:      completion.usage.total_tokens,
      })
    }
    return sanitizeOutput(JSON.parse(completion.choices[0].message.content))
  }

  try {
    return await run()
  } catch (err) {
    if (err.status >= 500 || err.code === 'ECONNRESET') {
      await new Promise((r) => setTimeout(r, 1500))
      return await run()
    }
    throw err
  }
}

// ── Agents ────────────────────────────────────────────────────────────────────

/**
 * Step 1: Validate and normalize the destination.
 */
export async function agentValidateDestination(destination) {
  const key = cacheKey({ fn: 'validate', destination: destination.toLowerCase().trim() })
  const cached = await getCache(key)
  if (cached) return cached

  const data = await callOpenAI([
    {
      role: 'system',
      content: `You are a travel planning assistant.
Validate if the destination is a real place and return a JSON object with these exact keys:
normalizedName, country, continent, currency, language, timezone, bestTimeToVisit, quickFacts (array of 3 strings).
If the destination is not real or too vague, set normalizedName to null.${PT_RULE}`,
    },
    { role: 'user', content: `Destination: ${destination}` },
  ], 500)

  if (!data.normalizedName) {
    throw new Error(`Destino "${destination}" não reconhecido. Tenta ser mais específico.`)
  }

  await setCache(key, data)
  return data
}

/**
 * Step 2: Generate day-by-day itinerary.
 * Returns { summary, totalEstimatedCost, days: [...] }
 * userPreferences: optional array of top activity types from past activity_feedback
 */
export async function agentGenerateDays({ destination, country, language, currency, startDate, endDate, groupType, travelStyle, mealsIncluded, transport, extras, budget, userPreferences = [] }) {
  const start = new Date(startDate)
  const end   = new Date(endDate)
  const days  = Math.max(1, Math.round((end - start) / 86400000) + 1)

  const key = cacheKey({ fn: 'days', destination, startDate, endDate, groupType, travelStyle, mealsIncluded, transport, extras, budget, currency })
  const cached = await getCache(key)
  if (cached) return cached

  const preferencesNote = userPreferences.length > 0
    ? `\n- User preference profile (from past choices): strongly favours activity types [${userPreferences.join(', ')}]. Prioritise these types when filling optional slots.`
    : ''

  const data = await callOpenAI([
    {
      role: 'system',
      content: `You are an expert travel planner for ${destination}, ${country}.
Generate a detailed day-by-day itinerary in JSON format.
Return an object with:
  - summary (string, 2 sentences describing the overall itinerary)
  - totalEstimatedCost (string, formatted total estimate e.g. "400-600 ${currency}")
  - days (array). Each day must have:
      - day (number)
      - date (YYYY-MM-DD)
      - theme (string, max 60 chars)
      - activities (array of 4-6 objects) each with:
          - time (HH:MM)
          - name (string)
          - description (string, max 200 chars)
          - address (string or null)
          - geoName (string or null — official English name for geocoding, e.g. "Eiffel Tower")
          - cost (number in ${currency} or null if free)
          - currency ("${currency}")
          - type ("visit" | "food" | "transport" | "leisure" | "hotel")
          - tips (string max 120 chars or null)

Rules:
- GEOGRAPHIC CLUSTERING (STRICT): Activities within each day must be geographically adjacent — walkable or in the same district. Group by neighbourhood: start all activities of a day in one zone, end in another, never jump between distant areas within the same day. A day spanning 2 zones max is ideal.
- Budget is roughly ${budget} ${currency} total
- Style: ${travelStyle.join(', ')}
- Group: ${groupType}
- Extras of interest: ${extras.join(', ')}${preferencesNote}
- Transport rules (STRICT): The traveller uses ONLY these modes: ${transport.join(', ')}. If you add a transport activity between zones, it MUST use one of these modes only. Do NOT suggest trams, metro, buses, taxis, or any other mode not in this list.
- Meal rules (STRICT — follow exactly):
${['breakfast', 'lunch', 'dinner'].map((meal) =>
        mealsIncluded.includes(meal)
          ? `  * INCLUDE a ${meal} activity at a proper restaurant or eatery that serves full ${meal} meals (NOT a café, bakery, or pastry shop)`
          : `  * DO NOT include any ${meal} activity — the traveller handles ${meal} independently`
      ).join('\n')}
- Language spoken there: ${language}${PT_RULE}`,
    },
    { role: 'user', content: `Generate a ${days}-day itinerary starting ${startDate} for ${destination}. Days: ${days}` },
  ], 7000)

  await setCache(key, data)
  return data
}

/**
 * Suggest 3 alternative replacements for one existing activity given user feedback.
 */
export async function agentSuggestActivity({ destination, currency, existingActivity, feedback }) {
  const data = await callOpenAI([
    {
      role: 'system',
      content: `You are an expert travel planner for ${destination}.
The user wants to replace one activity in their itinerary based on their feedback.
Return a JSON object with a "suggestions" array of exactly 3 alternatives.
Each suggestion must have:
  - whyThisOne (string max 100 chars — why this alternative fits the feedback)
  - time (HH:MM), name (string), description (string max 200 chars),
    address (string or null), geoName (string or null — official English name for geocoding),
    cost (number or null), currency ("${currency}"),
    type ("visit" | "food" | "transport" | "leisure" | "hotel"),
    tips (string max 120 chars or null).
Keep the same time slot unless feedback explicitly asks to change it.
Make each alternative meaningfully different from the others.${PT_RULE}`,
    },
    {
      role: 'user',
      content: `Current activity: ${JSON.stringify(existingActivity)}\nUser feedback: ${feedback}`,
    },
  ], 1500)

  return data
}

/**
 * Step 3: Generate practical tips + local phrases.
 */
export async function agentGenerateTips({ destination, country, groupType, travelStyle }) {
  const key = cacheKey({ fn: 'tips', destination, country, groupType, travelStyle })
  const cached = await getCache(key)
  if (cached) return cached

  const data = await callOpenAI([
    {
      role: 'system',
      content: `You are a local expert for ${destination}, ${country}.
Return a JSON object with these keys:
- safetyTips, transportTips, budgetHacks, mustTry, avoid: each an array of 3-5 short strings (max 120 chars each).
- localPhrases: array of 5 objects { local: "phrase in local language", translation: "tradução em Português (Portugal)" }.
Context: ${groupType} trip, style: ${travelStyle.join(', ')}.${PT_RULE}`,
    },
    { role: 'user', content: `Give practical tips and key local phrases for visiting ${destination}` },
  ], 1800)

  await setCache(key, data)
  return data
}

/**
 * Generate a personalised packing list for an itinerary.
 * Returns { items: string[] }
 */
export async function agentGeneratePackingList({ destination, country, days, travelStyle, groupType }) {
  const data = await callOpenAI([
    {
      role: 'system',
      content: `You are an expert travel packer helping travellers prepare for their trip.
Generate a practical, personalised packing list for the following trip.
Return a JSON object with a single key "items" — an array of strings (max 30 items).
Each item is a concise packing item name (e.g. "Adaptador de tomada", "Protetor solar SPF 50").
Cover essentials: documents, clothing, toiletries, electronics, health, trip-specific gear.
Tailor to the destination, climate, trip style, and group type.
Write items in Portuguese.`,
    },
    {
      role: 'user',
      content: `Destination: ${destination}, ${country}. Duration: ${days} days. Style: ${travelStyle?.join(', ')}. Group: ${groupType}.`,
    },
  ], 600)

  return data
}

/**
 * Suggest a social media caption for a travel post.
 * Uses vision model (llama-4-scout) when images are provided.
 * Returns { caption: string }
 */
export async function agentSuggestCaption({ destination, images }) {
  const hasImages = Array.isArray(images) && images.length > 0

  const systemMsg = {
    role: 'system',
    content: `You are a creative travel content writer who writes engaging, authentic social media captions.
Generate a single caption for a travel post. Return a JSON object with a single key "caption".
The caption should be 1-3 sentences, conversational, and genuine. Include 2-3 relevant hashtags at the end.
Write in Portuguese (European).`,
  }

  let userContent
  if (hasImages) {
    userContent = [
      { type: 'text', text: `Destination: ${destination}. Write a caption inspired by the photo(s).` },
      ...images.slice(0, 3).map((url) => ({ type: 'image_url', image_url: { url } })),
    ]
  } else {
    userContent = `Destination: ${destination}.`
  }

  const data = await callOpenAI(
    [systemMsg, { role: 'user', content: userContent }],
    300,
    { model: hasImages ? VISION_MODEL : MODEL, temperature: 0.9 },
  )

  return data
}

/**
 * Recommend ideal trip duration for a destination + travel style.
 * Returns { minDays, maxDays, idealDays, reasoning: string }
 */
export async function agentRecommendDuration({ destination, travelStyle = [], groupType = 'couple' }) {
  const key = cacheKey({ fn: 'duration', destination, travelStyle, groupType })
  const cached = await getCache(key)
  if (cached) return cached

  const data = await callOpenAI([
    {
      role: 'system',
      content: `You are an expert travel planner. Based on a destination, travel style, and group type, recommend the ideal trip duration.
Return a JSON object with:
  - minDays (number): minimum meaningful visit
  - maxDays (number): comfortable maximum before diminishing returns
  - idealDays (number): sweet spot recommendation
  - reasoning (string, max 120 chars, in Portuguese): one-line explanation of the recommendation`,
    },
    {
      role: 'user',
      content: `Destination: ${destination}. Style: ${travelStyle.join(', ') || 'balanced'}. Group: ${groupType}.`,
    },
  ], 200, { temperature: 0.3 })

  await setCache(key, data)
  return data
}

/**
 * Stream suggest-activity: yields each of 3 suggestion objects as they complete.
 * Uses JSON-Lines format in the prompt — model outputs one JSON object per line.
 */
export async function* agentStreamSuggestActivity({ destination, currency, existingActivity, feedback, feedbackHistory = [] }) {
  const stream = await obterCliente().chat.completions.create({
    model: MODEL,
    temperature: 0.8,
    max_tokens: 1800,
    stream: true,
    messages: [
      {
        role: 'system',
        content: `You are an expert travel planner for ${destination}.
The user wants to replace one activity in their itinerary based on their feedback.
Output exactly 3 alternative activities. Each alternative must be a valid JSON object on its own line (JSON Lines format).
No array brackets, no commas between objects — just one JSON object per line.
Each object must have:
  whyThisOne (string max 100 chars), time (HH:MM), name (string),
  description (string max 200 chars), address (string or null),
  geoName (string or null — official English name for geocoding),
  cost (number or null), currency ("${currency}"),
  type ("visit" | "food" | "transport" | "leisure" | "hotel"),
  tips (string max 120 chars or null).
Keep the same time slot unless feedback explicitly asks to change it.
Make each alternative meaningfully different from the others.${PT_RULE}`,
      },
      ...(feedbackHistory.length > 0 ? [{
        role: 'system',
        content: 'User preference history for this destination (most recent first):\n' +
          feedbackHistory.map((h, i) => `${i + 1}. Rejected "${h.original_name}" (reason: "${h.feedback}") → chose "${h.chosen_name}" (type: ${h.chosen_activity?.type ?? '?'})`).join('\n'),
      }] : []),
      {
        role: 'user',
        content: `Current activity: ${JSON.stringify(existingActivity)}\nUser feedback: ${feedback}`,
      },
    ],
  })

  let buffer = ''
  for await (const chunk of stream) {
    const delta = chunk.choices[0]?.delta?.content ?? ''
    buffer += delta
    const newlineIdx = buffer.lastIndexOf('\n')
    if (newlineIdx === -1) continue
    const completed = buffer.slice(0, newlineIdx)
    buffer = buffer.slice(newlineIdx + 1)
    for (const line of completed.split('\n')) {
      const trimmed = line.trim()
      if (!trimmed) continue
      try {
        const obj = JSON.parse(trimmed)
        yield sanitizeOutput(obj)
      } catch { /* incomplete line, skip */ }
    }
  }
  // Try remaining buffer
  if (buffer.trim()) {
    try {
      yield sanitizeOutput(JSON.parse(buffer.trim()))
    } catch { /* incomplete */ }
  }
}

/**
 * Stream a caption suggestion token-by-token via async generator.
 * Yields string deltas. Does NOT use JSON mode — outputs raw caption text.
 */
export async function* agentStreamCaption({ destination, images }) {
  const hasImages = Array.isArray(images) && images.length > 0

  let userContent
  if (hasImages) {
    userContent = [
      { type: 'text', text: `Destination: ${destination}. Write a caption inspired by the photo(s).` },
      ...images.slice(0, 3).map((url) => ({ type: 'image_url', image_url: { url } })),
    ]
  } else {
    userContent = `Destination: ${destination}.`
  }

  const stream = await obterCliente().chat.completions.create({
    model: hasImages ? VISION_MODEL : MODEL,
    temperature: 0.9,
    max_tokens: 300,
    stream: true,
    messages: [
      {
        role: 'system',
        content: `You are a creative travel content writer who writes engaging, authentic social media captions.
Generate a single caption for a travel post. Output ONLY the caption text — no JSON, no quotes, no explanation.
The caption should be 1-3 sentences, conversational, and genuine. Include 2-3 relevant hashtags at the end.
Write in Portuguese (European).`,
      },
      { role: 'user', content: userContent },
    ],
  })

  for await (const chunk of stream) {
    const delta = chunk.choices[0]?.delta?.content
    if (delta) yield delta
  }
}

/**
 * Suggest new travel destinations based on the user's past travel history.
 * Returns { destinations: Array<{ name, country, why, emoji }> }
 */
export async function agentSuggestDestinations({ pastDestinations, travelStyles }) {
  const key = cacheKey({ fn: 'suggest-dest', pastDestinations: pastDestinations.slice(0, 5), travelStyles })
  const cached = await getCache(key)
  if (cached) return cached

  const data = await callOpenAI([
    {
      role: 'system',
      content: `You are a travel recommendation expert. Based on someone's past travel history and preferred travel styles, suggest 4 new destinations they would love.
Return a JSON object with a "destinations" array of exactly 4 items.
Each item must have:
  - name (string — city or region name)
  - country (string)
  - why (string, max 80 chars — why this fits their taste)
  - emoji (string — 1-2 relevant emoji)
Avoid destinations already in the past list. Vary continents. Rank by how well it fits their style.${PT_RULE}`,
    },
    {
      role: 'user',
      content: `Past destinations: ${pastDestinations.join(', ')}. Travel styles: ${travelStyles.join(', ')}.`,
    },
  ], 600)

  await setCache(key, data)
  return data
}

/**
 * Suggest 3 activity ideas for a day being built in the manual builder.
 * userPreferences: optional array of top activity types from past activity_feedback
 */
export async function agentSuggestForDay({ destination, dayNumber, existingActivities, currency = 'EUR', userPreferences = [] }) {
  const existing = existingActivities?.length > 0
    ? `Already planned: ${existingActivities.map((a) => a.name).join(', ')}.`
    : 'No activities planned yet for this day.'

  const preferencesNote = userPreferences.length > 0
    ? `\nUser preference profile: favours [${userPreferences.join(', ')}] activity types — bias suggestions toward these when variety allows.`
    : ''

  const data = await callOpenAI([
    {
      role: 'system',
      content: `You are an expert travel planner for ${destination}.
Suggest 3 different activity ideas for day ${dayNumber} of an itinerary.
${existing}
Avoid repeating activities already planned. Provide variety (mix of visit, food, leisure).${preferencesNote}
Return a JSON object with a "suggestions" array of exactly 3 items.
Each item must have:
  time (HH:MM), name (string), description (string max 200 chars),
  address (string or null), geoName (string or null — official English name for geocoding),
  cost (number or null), currency ("${currency}"),
  type ("visit" | "food" | "transport" | "leisure" | "hotel"),
  tips (string max 120 chars or null).${PT_RULE}`,
    },
    { role: 'user', content: `Suggest 3 activities for day ${dayNumber} in ${destination}` },
  ], 1500)

  return data
}


export async function agentRefineDays({ destination, currency, currentDays, userMessage, conversationHistory = [] }) {
  const messages = [
    {
      role: 'system',
      content: `You are an expert travel planner refining an itinerary for ${destination}.
The user will describe changes they want to make to their itinerary.
Respond with ONLY a JSON object with a single key "days" containing the updated days array.
Preserve the exact same structure as the input. Only modify what the user asks.
Each day must have: day (number), date (ISO date string), theme (string), activities (array).
Each activity must have: time (HH:MM), name, description, address (string or null), geoName (string or null), cost (number or null), currency ("${currency}"), type ("visit"|"food"|"transport"|"leisure"|"hotel"), tips (string or null).
Never remove days unless explicitly asked. Never change the day numbers or dates.${PT_RULE}`,
    },
    ...conversationHistory,
    {
      role: 'user',
      content: `Current itinerary days:\n${JSON.stringify(currentDays, null, 2)}\n\nUser request: ${userMessage}`,
    },
  ]

  const data = await callOpenAI(messages, 4000, { temperature: 0.6 })
  if (!data?.days) throw new Error('Resposta inválida do agente.')
  return { days: sanitizeOutput(data.days) }
}

const WMO_DESC = {
  0: 'céu limpo', 1: 'quase limpo', 2: 'parcialmente nublado', 3: 'nublado',
  45: 'nevoeiro', 48: 'nevoeiro com geada',
  51: 'chuviscos leves', 53: 'chuviscos moderados', 55: 'chuviscos fortes',
  61: 'chuva leve', 63: 'chuva moderada', 65: 'chuva forte',
  71: 'neve leve', 73: 'neve moderada', 75: 'neve forte', 77: 'granizo',
  80: 'aguaceiros leves', 81: 'aguaceiros moderados', 82: 'aguaceiros fortes',
  85: 'aguaceiros de neve', 86: 'aguaceiros de neve fortes',
  95: 'trovoada', 96: 'trovoada com granizo', 99: 'trovoada com granizo forte',
}

export async function agentAdaptDayForWeather({ destination, currency, day, weatherCode, tempMax, tempMin }) {
  const weatherDesc = WMO_DESC[weatherCode] ?? 'mau tempo'
  const data = await callOpenAI([
    {
      role: 'system',
      content: `You are an expert travel planner. The user is in ${destination} and the weather forecast for this day is: ${weatherDesc} (max ${tempMax}°C, min ${tempMin}°C).
Suggest adapted activities that are suitable for this weather.
For outdoor activities that would be problematic in this weather, suggest indoor alternatives.
Return a JSON object with key "activities" — same structure as the input activities but adapted.
Each activity: time (HH:MM), name, description, address (string or null), geoName (string or null), cost (number or null), currency ("${currency}"), type ("visit"|"food"|"transport"|"leisure"|"hotel"), tips (string or null).
Keep all activities — only modify those affected by the weather.${PT_RULE}`,
    },
    {
      role: 'user',
      content: `Day ${day.day} (${day.date}) — ${day.theme}\nActivities:\n${JSON.stringify(day.activities, null, 2)}`,
    },
  ], 3000, { temperature: 0.7 })

  if (!data?.activities) throw new Error('Resposta inválida do agente.')
  return { activities: sanitizeOutput(data.activities) }
}

/**
 * Natural language destination search — interprets a freeform travel query and returns destination suggestions.
 * Returns { suggestions: [{ destination, country, why, bestFor, budget }] }
 */
export async function agentSearchDestinations(query) {
  const key = cacheKey({ fn: 'searchDestinations', query })
  const cached = await getCache(key)
  if (cached) return cached

  const data = await callOpenAI([
    {
      role: 'system',
      content: `You are a world-class travel advisor. The user will describe what kind of trip they want in natural language.
Return a JSON object with a "suggestions" array of exactly 5 destination recommendations.
Each suggestion must have:
  - destination (string — city or region name, e.g. "Bali", "Lisbon")
  - country (string)
  - why (string, max 80 chars — why this matches the user's request)
  - bestFor (string, max 50 chars — e.g. "Sol, praias, vida nocturna")
  - estimatedBudget (string — e.g. "400-700 EUR/semana")
Order results from best match to least.${PT_RULE}`,
    },
    {
      role: 'user',
      content: `Travel query: "${query}"`,
    },
  ], 800, { temperature: 0.5 })

  if (!data?.suggestions) throw new Error('Resposta inválida do agente.')
  const result = { suggestions: sanitizeOutput(data.suggestions) }
  await setCache(key, result)
  return result
}

/**
 * Auto-moderate a content report: classify severity and suggested action.
 * Returns { severity: "low"|"medium"|"high"|"critical", action: "review"|"remove"|"ban", reasoning: string }
 */
export async function agentModerateReport({ targetType, reason, detail }) {
  const data = await callOpenAI([
    {
      role: 'system',
      content: `You are a content moderation assistant for a travel social network.
Classify the severity of a user content report and suggest a moderation action.
Return a JSON object with:
  - severity: "low" | "medium" | "high" | "critical"
  - action: "review" (needs human review) | "remove" (content should be removed) | "ban" (user should be banned)
  - reasoning: string (max 100 chars, in Portuguese, explaining your classification)

Guidelines:
- "spam" / "misinformation" → usually "low" or "medium", action "review"
- "hate" / "violence" → "high" or "critical", action "remove" or "ban"
- "nudity" → "medium" to "high", action "remove"
- "other" with no detail → "low", action "review"
Always be conservative — when in doubt, suggest "review" not "ban".${PT_RULE}`,
    },
    {
      role: 'user',
      content: `Report: type="${targetType}", reason="${reason}", detail="${detail ?? 'none'}"`,
    },
  ], 200, { temperature: 0.1 })

  return data
}

/**
 * Match travel buddies: find users with compatible travel styles.
 * Returns { matches: Array<{ userId, compatibility, sharedStyles, suggestion }> }
 */
export async function agentTravelBuddyMatch({ userStyles, candidates }) {
  if (!candidates || candidates.length === 0) return { matches: [] }

  const data = await callOpenAI([
    {
      role: 'system',
      content: `You are a travel compatibility expert for a social travel app.
Given a user's travel styles and a list of candidate users with their styles, rank candidates by compatibility.
Return a JSON object with a "matches" array of up to 5 candidates.
Each match must have:
  - userId (string — copy from candidate)
  - compatibility (number 0-100 — percentage match)
  - sharedStyles (array of strings — travel styles in common)
  - suggestion (string max 80 chars — why they'd travel well together, in Portuguese)
Only include candidates with compatibility ≥ 40. Sort by compatibility descending.${PT_RULE}`,
    },
    {
      role: 'user',
      content: `User styles: ${JSON.stringify(userStyles)}. Candidates: ${JSON.stringify(candidates.slice(0, 20))}`,
    },
  ], 800)

  return data
}

/**
 * Generate destination suggestions from a mood/vibe description.
 * Returns { suggestions: Array<{ destination, country, why, vibe, estimatedBudget, bestSeason }> }
 */
export async function agentMoodTrip({ mood, budget, month, groupType }) {
  const key = cacheKey({ fn: 'moodTrip', mood: mood.toLowerCase().trim(), budget, month, groupType })
  const cached = await getCache(key)
  if (cached) return cached

  const data = await callOpenAI([
    {
      role: 'system',
      content: `You are a creative travel advisor who specialises in matching vibes and moods to destinations.
The user describes a travel vibe or aesthetic and you suggest the perfect destinations.
Return a JSON object with a "suggestions" array of exactly 4 destination suggestions.
Each suggestion must have:
  - destination (string — city or region)
  - country (string)
  - why (string, max 100 chars — how this destination matches the mood)
  - vibe (string, max 60 chars — the essence of this destination in a few words)
  - estimatedBudget (string — e.g. "500-800 EUR/semana")
  - bestSeason (string — e.g. "Abril a Outubro")
Vary continents and budget levels. Be creative and unexpected — avoid obvious choices when possible.${PT_RULE}`,
    },
    {
      role: 'user',
      content: `Travel vibe: "${mood}". Budget hint: ${budget ? `~${budget} EUR` : 'flexible'}. Travel month: ${month ?? 'flexible'}. Group: ${groupType ?? 'couple'}.`,
    },
  ], 900, { temperature: 0.7 })

  if (!data?.suggestions) throw new Error('Resposta inválida do agente.')
  const result = { suggestions: sanitizeOutput(data.suggestions) }
  await setCache(key, result)
  return result
}

/**
 * Identify the destination from a travel photo using Llama 4 Scout vision.
 * Returns { destination: string | null, country: string | null, confidence: "high"|"medium"|"low", landmarks: string[] }
 */
export async function agentIdentifyDestinationFromPhoto(imageUrl) {
  const data = await callOpenAI([
    {
      role: 'system',
      content: `You are a travel geography expert with extensive knowledge of world landmarks and destinations.
Analyse the provided travel photo and identify the location.
Return a JSON object with:
  - destination (string or null — city/region name, e.g. "Paris", "Bali")
  - country (string or null)
  - confidence ("high" | "medium" | "low")
  - landmarks (array of strings — recognisable elements that led to the identification, max 3)
If you cannot identify the location with at least low confidence, set destination and country to null.${PT_RULE}`,
    },
    {
      role: 'user',
      content: [
        { type: 'text', text: 'Identify the travel destination in this photo.' },
        { type: 'image_url', image_url: { url: imageUrl } },
      ],
    },
  ], 300, { model: VISION_MODEL, temperature: 0.2 })

  return data
}

// src/ai/prompt-builder.test.js
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { buildItineraryPrompt, parseItineraryResponse } from './prompt-builder.js'

const BASE_ANSWERS = {
  destination:         { name: 'Tokyo', countryCode: 'JP', lat: 35.68, lng: 139.69 },
  startDate:           '2026-08-01',
  endDate:             '2026-08-07',
  groupType:           'solo',
  groupSize:           1,
  transportModes:      ['public'],
  travelStyles:        ['culture', 'food'],
  budgetPerDay:        15000,
  accommodationType:   'airbnb',
  pacePreference:      'moderate',
  dietaryRestrictions: [],
  mustSeeAttractions:  ['Senso-ji Temple'],
  avoidCategories:     [],
  visibility:          'public',
  language:            'pt-PT',
}

// ---------------------------------------------------------------------------
// buildItineraryPrompt
// ---------------------------------------------------------------------------
describe('buildItineraryPrompt', () => {
  it('devolve objecto com system e user', () => {
    const { system, user } = buildItineraryPrompt(BASE_ANSWERS)
    assert.equal(typeof system, 'string')
    assert.equal(typeof user, 'string')
    assert.ok(system.length > 100, 'system prompt deve ter substância')
    assert.ok(user.length > 50, 'user prompt deve ter substância')
  })

  it('inclui o destino no user prompt', () => {
    const { user } = buildItineraryPrompt(BASE_ANSWERS)
    assert.ok(user.includes('Tokyo'), 'deve mencionar o destino')
    assert.ok(user.includes('JP'), 'deve mencionar o código do país')
  })

  it('inclui duração correcta no user prompt', () => {
    const { user } = buildItineraryPrompt(BASE_ANSWERS)
    // 01 a 07 Agosto = 7 dias
    assert.ok(user.includes('7-day'), `deve mencionar 7 dias, got: ${user.slice(0, 200)}`)
  })

  it('inclui must-see attractions no user prompt', () => {
    const { user } = buildItineraryPrompt(BASE_ANSWERS)
    assert.ok(user.includes('Senso-ji Temple'), 'deve incluir atracções obrigatórias')
  })

  it('inclui instrução de língua no user prompt', () => {
    const { user: ptPT } = buildItineraryPrompt({ ...BASE_ANSWERS, language: 'pt-PT' })
    assert.ok(ptPT.includes('European Portuguese'), 'deve pedir pt-PT')

    const { user: ptBR } = buildItineraryPrompt({ ...BASE_ANSWERS, language: 'pt-BR' })
    assert.ok(ptBR.includes('Brazilian Portuguese'), 'deve pedir pt-BR')

    const { user: en } = buildItineraryPrompt({ ...BASE_ANSWERS, language: 'en' })
    assert.ok(en.includes('English'), 'deve pedir inglês')
  })

  it('menciona budget quando fornecido', () => {
    const { user } = buildItineraryPrompt(BASE_ANSWERS)
    assert.ok(user.includes('€150'), 'deve converter 15000 cents em €150')
  })

  it('menciona orçamento sem definir quando budget é null', () => {
    const { user } = buildItineraryPrompt({ ...BASE_ANSWERS, budgetPerDay: null })
    assert.ok(user.includes('sem orçamento'), 'deve indicar ausência de orçamento')
  })
})

// ---------------------------------------------------------------------------
// parseItineraryResponse
// ---------------------------------------------------------------------------
describe('parseItineraryResponse', () => {
  const VALID_RESPONSE = JSON.stringify({
    title:    'Tokyo Adventure',
    summary:  'A 7-day trip',
    warnings: [],
    days: [
      {
        day_number: 1,
        date: '2026-08-01',
        theme: 'Temples',
        notes: null,
        activities: [
          {
            position: 1,
            name: 'Senso-ji Temple',
            category: 'attraction',
            address: 'Asakusa, Tokyo',
            lat: 35.71,
            lng: 139.79,
            start_time: '09:00',
            duration_minutes: 120,
            notes: null,
            booking_url: null,
            price_estimate: 0,
            ai_warning: null,
            external_id: null,
            external_source: null,
          },
        ],
      },
    ],
    packing_list: { categories: [] },
    carbon_estimate: { total_kg: 400, transport_kg: 350, accommodation_kg: 50, notes: '' },
  })

  it('processa resposta válida sem erros', () => {
    const result = parseItineraryResponse(VALID_RESPONSE)
    assert.equal(result.title, 'Tokyo Adventure')
    assert.equal(result.days.length, 1)
    assert.equal(result.days[0].activities.length, 1)
  })

  it('remove blocos de markdown da resposta', () => {
    const withMarkdown = '```json\n' + VALID_RESPONSE + '\n```'
    const result = parseItineraryResponse(withMarkdown)
    assert.equal(result.title, 'Tokyo Adventure')
  })

  it('lança erro para JSON inválido', () => {
    assert.throws(
      () => parseItineraryResponse('não é JSON'),
      (err) => {
        assert.match(err.message, /JSON inválido/)
        return true
      }
    )
  })

  it('lança erro quando title está ausente', () => {
    const noTitle = JSON.stringify({ days: [{ day_number: 1, activities: [] }] })
    assert.throws(
      () => parseItineraryResponse(noTitle),
      (err) => { assert.match(err.message, /title/); return true }
    )
  })

  it('lança erro quando days está ausente', () => {
    const noDays = JSON.stringify({ title: 'Test' })
    assert.throws(
      () => parseItineraryResponse(noDays),
      (err) => { assert.match(err.message, /days/); return true }
    )
  })

  it('converte strings numéricas para números', () => {
    const withStrings = JSON.parse(VALID_RESPONSE)
    withStrings.days[0].activities[0].price_estimate   = '500'
    withStrings.days[0].activities[0].duration_minutes = '120'
    withStrings.days[0].activities[0].lat = '35.71'
    const result = parseItineraryResponse(JSON.stringify(withStrings))
    assert.equal(typeof result.days[0].activities[0].price_estimate,   'number')
    assert.equal(typeof result.days[0].activities[0].duration_minutes, 'number')
    assert.equal(typeof result.days[0].activities[0].lat,              'number')
  })

  it('substitui categoria inválida por "activity"', () => {
    const withBadCategory = JSON.parse(VALID_RESPONSE)
    withBadCategory.days[0].activities[0].category = 'invalid_category'
    const result = parseItineraryResponse(JSON.stringify(withBadCategory))
    assert.equal(result.days[0].activities[0].category, 'activity')
  })

  it('trunca strings que excedam o limite da BD', () => {
    const withLongString = JSON.parse(VALID_RESPONSE)
    withLongString.days[0].activities[0].name = 'A'.repeat(300)
    const result = parseItineraryResponse(JSON.stringify(withLongString))
    assert.ok(result.days[0].activities[0].name.length <= 200)
  })
})

// ---------------------------------------------------------------------------
// src/expenses/expenses.service.test.js (inline para manter ficheiros compactos)
// ---------------------------------------------------------------------------
describe('ExpensesService._toEur', () => {
  // Testar o helper de conversão directamente instanciando o service
  // com um db mock vazio — só testamos o método puro _toEur

  it('EUR mantém valor e rate=1', async () => {
    // Importar dinamicamente para evitar circular em testes combinados
    const { ExpensesService } = await import('../expenses/expenses.service.js')
    const svc = new ExpensesService({})

    const result = svc._toEur(1000, 'EUR')
    assert.equal(result.amountEurCents, 1000)
    assert.equal(result.exchangeRate,   1.0)
  })

  it('converte JPY para EUR correctamente', async () => {
    const { ExpensesService } = await import('../expenses/expenses.service.js')
    const svc = new ExpensesService({})

    // 1 EUR = 162.5 JPY → 1625 JPY cents / 162.5 = 10 EUR cents
    const result = svc._toEur(1625, 'JPY')
    assert.equal(result.amountEurCents, 10)
    assert.ok(result.exchangeRate > 0)
  })

  it('moeda desconhecida devolve null sem lançar erro', async () => {
    const { ExpensesService } = await import('../expenses/expenses.service.js')
    const svc = new ExpensesService({})

    const result = svc._toEur(1000, 'XYZ')
    assert.equal(result.amountEurCents, null)
    assert.equal(result.exchangeRate,   null)
  })
})

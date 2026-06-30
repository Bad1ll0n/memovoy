// src/__tests__/utils.test.ts
// Testes unitários dos utilitários da web app.
// Correr com: npx vitest ou node --test (Next.js usa jest por defeito)

// Nota: Next.js 15 com node:test nativo — sem Jest nem Vitest
// Para correr: npx tsx --test src/__tests__/utils.test.ts
// Ou adicionar ao jest.config: transform + moduleNameMapper

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

// Importar funções a testar (copiar lógica para evitar import de módulos Next.js)
// Em produção usar jest/vitest para resolver paths automaticamente

function formatMoney(cents: number, currency = 'EUR'): string {
  return new Intl.NumberFormat('pt-PT', {
    style:    'currency',
    currency,
    maximumFractionDigits: cents % 100 === 0 ? 0 : 2,
  }).format(cents / 100)
}

function countryFlag(code: string): string {
  return code.toUpperCase().replace(/./g, (c) =>
    String.fromCodePoint(127397 + c.charCodeAt(0))
  )
}

function groupTypeLabel(type: string): string {
  const labels: Record<string, string> = {
    solo:    'Solo',
    couple:  'Casal',
    friends: 'Amigos',
    family:  'Família',
  }
  return labels[type] ?? type
}

function levelLabel(level: string): { label: string; color: string } {
  const map: Record<string, { label: string; color: string }> = {
    explorer:     { label: 'Explorador',   color: '#185FA5' },
    traveler:     { label: 'Viajante',     color: '#0F6E50' },
    nomad:        { label: 'Nómada',       color: '#7B1FA2' },
    globetrotter: { label: 'Globetrotter', color: '#EF9F27' },
  }
  return map[level] ?? { label: level, color: '#5C5C5C' }
}

function truncate(str: string, maxLen: number): string {
  if (str.length <= maxLen) return str
  return str.slice(0, maxLen - 1) + '…'
}

// ---------------------------------------------------------------------------
// formatMoney
// ---------------------------------------------------------------------------

describe('formatMoney', () => {

  it('formata EUR com símbolo €', () => {
    const result = formatMoney(1000)
    assert.ok(result.includes('€') || result.includes('EUR'), 'deve conter € ou EUR')
    assert.ok(result.includes('10'), 'deve conter o valor 10')
  })

  it('omite decimais quando montante é múltiplo de 100', () => {
    const result = formatMoney(5000, 'EUR')
    assert.ok(!result.includes(',00') && !result.includes('.00'),
      `deve omitir decimais para múltiplos de 100: ${result}`)
  })

  it('inclui decimais quando montante tem cêntimos', () => {
    const result = formatMoney(1099, 'EUR')
    assert.ok(result.includes('99'), 'deve incluir os cêntimos')
  })

  it('zero formata como 0 €', () => {
    const result = formatMoney(0)
    assert.ok(result.includes('0'), 'deve incluir zero')
  })

  it('montante grande formata correctamente', () => {
    const result = formatMoney(100000) // €1000
    assert.ok(result.includes('1'), 'deve conter o valor')
  })
})

// ---------------------------------------------------------------------------
// countryFlag
// ---------------------------------------------------------------------------

describe('countryFlag', () => {

  it('PT produz 🇵🇹', () => {
    const flag = countryFlag('PT')
    assert.equal(flag, '🇵🇹')
  })

  it('BR produz 🇧🇷', () => {
    const flag = countryFlag('BR')
    assert.equal(flag, '🇧🇷')
  })

  it('aceita código em minúsculas', () => {
    const flagUpper = countryFlag('PT')
    const flagLower = countryFlag('pt')
    assert.equal(flagUpper, flagLower, 'maiúsculas e minúsculas devem dar o mesmo resultado')
  })

  it('JP produz 🇯🇵', () => {
    assert.equal(countryFlag('JP'), '🇯🇵')
  })
})

// ---------------------------------------------------------------------------
// groupTypeLabel
// ---------------------------------------------------------------------------

describe('groupTypeLabel', () => {

  it('devolve labels correctos para todos os tipos', () => {
    assert.equal(groupTypeLabel('solo'),    'Solo')
    assert.equal(groupTypeLabel('couple'),  'Casal')
    assert.equal(groupTypeLabel('friends'), 'Amigos')
    assert.equal(groupTypeLabel('family'),  'Família')
  })

  it('devolve o próprio tipo para valores desconhecidos', () => {
    assert.equal(groupTypeLabel('unknown'), 'unknown')
  })
})

// ---------------------------------------------------------------------------
// levelLabel
// ---------------------------------------------------------------------------

describe('levelLabel', () => {

  it('devolve label e color para cada nível', () => {
    const levels = ['explorer', 'traveler', 'nomad', 'globetrotter']
    for (const level of levels) {
      const { label, color } = levelLabel(level)
      assert.ok(label.length > 0,      `${level} deve ter label`)
      assert.ok(color.startsWith('#'),  `${level} deve ter color hex`)
    }
  })

  it('cores são distintas entre níveis', () => {
    const colors = ['explorer','traveler','nomad','globetrotter']
      .map(l => levelLabel(l).color)
    const unique = new Set(colors)
    assert.equal(unique.size, colors.length, 'cada nível deve ter cor única')
  })

  it('nível desconhecido devolve fallback', () => {
    const { label, color } = levelLabel('unknown-level')
    assert.equal(label, 'unknown-level')
    assert.equal(color, '#5C5C5C')
  })
})

// ---------------------------------------------------------------------------
// truncate
// ---------------------------------------------------------------------------

describe('truncate', () => {

  it('não trunca strings mais curtas que o limite', () => {
    assert.equal(truncate('abc', 10), 'abc')
  })

  it('não trunca strings exactamente do tamanho do limite', () => {
    assert.equal(truncate('abcde', 5), 'abcde')
  })

  it('trunca strings mais longas com reticências', () => {
    const result = truncate('abcdefghij', 5)
    assert.equal(result.length, 5)
    assert.ok(result.endsWith('…'), 'deve terminar com …')
  })

  it('string vazia não trunca', () => {
    assert.equal(truncate('', 10), '')
  })

  it('maxLen 1 produz só reticências', () => {
    const result = truncate('abc', 1)
    assert.equal(result, '…')
  })
})

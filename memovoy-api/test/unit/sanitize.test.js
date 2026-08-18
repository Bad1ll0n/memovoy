import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { sanitizeText, sanitizeOutput } from '../../src/services/aiAgent.js'

// sanitizeOutput corre sobre TODAS as respostas de IA (callOpenAI em aiAgent.js).
// Um bug aqui corrompe roteiros, dicas, listas de bagagem e legendas de uma vez só.

describe('sanitizeText', () => {
  test('preserva espaços — regressão: o regex de null bytes era / / e colava as palavras', () => {
    assert.equal(
      sanitizeText('Visitar o Mosteiro dos Jerónimos'),
      'Visitar o Mosteiro dos Jerónimos',
    )
  })

  test('remove null bytes', () => {
    assert.equal(sanitizeText('Lisboa\u0000injectado'), 'Lisboainjectado')
  })

  test('remove tags HTML mas mantém o texto à volta', () => {
    assert.equal(sanitizeText('<b>Porto</b> e Gaia'), 'Porto e Gaia')
  })

  test('neutraliza script injectado pelo modelo', () => {
    assert.equal(sanitizeText('<script>alert(1)</script>Braga'), 'alert(1)Braga')
  })

  test('faz trim das pontas sem tocar nos espaços interiores', () => {
    assert.equal(sanitizeText('  Serra da Estrela  '), 'Serra da Estrela')
  })

  test('deixa passar não-strings intactos', () => {
    assert.equal(sanitizeText(42), 42)
    assert.equal(sanitizeText(null), null)
    assert.equal(sanitizeText(undefined), undefined)
    assert.equal(sanitizeText(true), true)
  })

  test('preserva acentuação portuguesa', () => {
    assert.equal(sanitizeText('Peniche à noite, açorda e pão'), 'Peniche à noite, açorda e pão')
  })
})

describe('sanitizeOutput', () => {
  test('percorre objectos aninhados preservando espaços', () => {
    const input = {
      days: [
        { title: 'Dia 1 em Lisboa', activities: [{ name: 'Torre de Belém', cost: 6 }] },
      ],
    }
    assert.deepEqual(sanitizeOutput(input), input)
  })

  test('limpa strings em profundidade dentro de arrays', () => {
    const out = sanitizeOutput([{ tip: '<i>Leva</i> água\u0000' }])
    assert.deepEqual(out, [{ tip: 'Leva água' }])
  })

  test('preserva os tipos dos valores não-string', () => {
    const out = sanitizeOutput({ cost: 12.5, free: false, tags: [1, 2], nada: null })
    assert.deepEqual(out, { cost: 12.5, free: false, tags: [1, 2], nada: null })
  })

  test('mantém as chaves inalteradas', () => {
    const out = sanitizeOutput({ 'geoName': 'Lisbon', 'why_go': 'Vale a pena' })
    assert.deepEqual(Object.keys(out), ['geoName', 'why_go'])
  })
})

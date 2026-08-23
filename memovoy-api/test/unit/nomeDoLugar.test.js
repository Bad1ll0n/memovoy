import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { correspondeAoPedido, semelhanca, normalizar, LIMIAR } from '../../src/services/nomeDoLugar.js'

// Procurar "St. Peter's Basilica, Roma, Itália" no Nominatim devolve a Basílica
// de San Pietro in Vincoli — outra igreja, a 1,5 km, com horário próprio.
//
// A verificação de distância não apanha isto: 1,5 km está muito dentro dos
// 150 km que servem para excluir outro continente. Para um pino no mapa é um
// erro que se vê; para um horário de abertura seria dizer a alguém que São
// Pedro fecha às 12:30 porque é a essa hora que fecha uma igreja diferente.
//
// As respostas abaixo são as verdadeiras, obtidas do Nominatim com
// namedetails=1 ao construir isto.

const SAO_PEDRO_ERRADO = {
  display_name: 'Basilica di San Pietro in Vincoli, 4/a, Piazza di San Pietro in Vincoli, Roma',
  namedetails: {
    name: 'Basilica di San Pietro in Vincoli',
    'name:en': 'Saint Peter in Chains',
    'name:it': 'Basilica di San Pietro in Vincoli',
    'name:fr': 'Basilique Saint-Pierre-aux-Liens',
  },
}

const CAPITOLINOS = {
  display_name: 'Musei Capitolini, Via del Teatro di Marcello, Campitelli, Roma',
  namedetails: {
    name: 'Musei Capitolini',
    'name:en': 'Capitoline Museums',
    'name:de': 'Kapitolinische Museen',
    'name:es': 'Museos Capitolinos',
  },
}

const COLISEU = {
  display_name: 'Coliseu, Celio, Municipio Roma I, Roma, Roma Capitale, Lácio',
  namedetails: {
    name: 'Colosseo',
    'name:en': 'Colosseum',
    'name:es': 'Coliseo',
    'name:de': 'Kolosseum',
  },
}

describe('o caso que motivou isto', () => {
  test('São Pedro contra San Pietro in Vincoli não coincide', () => {
    const r = correspondeAoPedido("St. Peter's Basilica", SAO_PEDRO_ERRADO)

    assert.equal(r.coincide, false)
    assert.ok(r.melhor < LIMIAR, `semelhança ${r.melhor.toFixed(2)}`)
  })

  test('e é "vincoli" que faz a diferença, não o tamanho do nome', () => {
    // As duas basílicas partilham tudo menos uma palavra. Se as partículas
    // ("di", "in") contassem, a semelhança subia o suficiente para passar.
    assert.ok(semelhanca('Basilica di San Pietro', 'Basilica di San Pietro in Vincoli') < 1)
  })
})

describe('os que têm de coincidir', () => {
  test('o nome em inglês bate com o nome em inglês', () => {
    const r = correspondeAoPedido('Capitoline Museums', CAPITOLINOS)

    assert.equal(r.coincide, true)
    assert.equal(r.nomeQueBateu, 'Capitoline Museums')
  })

  test('procurar em inglês encontra um sítio que se chama outra coisa', () => {
    // O nome principal do Coliseu no OSM é "Colosseo". É por isto que se
    // comparam TODOS os nomes e não só o principal.
    const r = correspondeAoPedido('Colosseum', COLISEU)

    assert.equal(r.coincide, true)
    assert.equal(r.nomeQueBateu, 'Colosseum')
  })

  test('o que o modelo põe à frente não estraga a comparação', () => {
    // "Almoço no", "Visita ao" — o modelo escreve assim, e essas palavras não
    // dizem nada sobre que sítio é.
    const trattoria = {
      display_name: 'Trattoria da Cesare, 45, Via del Casaletto, Roma',
      namedetails: { name: 'Trattoria da Cesare' },
    }
    assert.equal(correspondeAoPedido('Almoço no Trattoria da Cesare', trattoria).coincide, true)
    assert.equal(correspondeAoPedido('Visita ao Coliseu', { namedetails: { name: 'Coliseu' } }).coincide, true)
  })

  test('acentos e pontuação não contam', () => {
    assert.equal(correspondeAoPedido('Panteao', { namedetails: { name: 'Panteão' } }).coincide, true)
    assert.equal(correspondeAoPedido("St. Peter's", { namedetails: { name: 'St Peters' } }).coincide, true)
  })
})

describe('quando não há por onde comparar', () => {
  test('sem nomes nenhuns, não coincide', () => {
    // Não coincidir é o lado seguro: sem confirmação, o horário não se usa.
    assert.equal(correspondeAoPedido('Coliseu', {}).coincide, false)
    assert.equal(correspondeAoPedido('Coliseu', { namedetails: {} }).coincide, false)
  })

  test('sem namedetails, o display_name serve de rede', () => {
    const r = correspondeAoPedido('Trattoria da Cesare', {
      display_name: 'Trattoria da Cesare, 45, Via del Casaletto, Roma',
    })
    assert.equal(r.coincide, true)
  })

  test('um termo que é só palavras vazias não coincide com nada', () => {
    // "Almoço no" sozinho não identifica sítio nenhum, e deixá-lo coincidir por
    // não sobrar nada para comparar seria aceitar tudo.
    assert.equal(correspondeAoPedido('Almoço no', { namedetails: { name: 'Seja o que for' } }).coincide, false)
  })
})

describe('a normalização', () => {
  test('tira acentos, maiúsculas e pontuação', () => {
    assert.equal(normalizar('Basílica de São Pedro'), 'basilica de sao pedro')
    assert.equal(normalizar("St. Peter's"), 'st peters')
    assert.equal(normalizar('  Campo   de\' Fiori  '), 'campo de fiori')
  })
})

import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { correspondeAoPedido, semelhanca, normalizar, limparTermo, LIMIAR } from '../../src/services/nomeDoLugar.js'

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

// ─────────────────────────────────────────────────────────────────────────────
// A mesma palavra escrita de outra maneira
//
// "St. Peter's Basilica" contra "Saint Peter's Basilica" dava 0,67 e era
// recusado — o mesmo sítio, travado por uma abreviatura. Metade dos monumentos
// da Europa é um santo qualquer, e o OSM escreve o honorífico na língua local
// enquanto o modelo escreve noutra.
describe('abreviaturas e variantes da mesma palavra', () => {
  test('St. e Saint são a mesma coisa', () => {
    const r = correspondeAoPedido("St. Peter's Basilica", {
      namedetails: { name: "Saint Peter's Basilica", 'name:it': 'Basilica di San Pietro' },
    })
    assert.equal(r.coincide, true)
  })

  test('mas São Pedro continua a não ser São Pedro in Vincoli', () => {
    // É a verificação que interessa: juntar as variantes do honorífico não pode
    // aproximar duas igrejas que são mesmo diferentes.
    const r = correspondeAoPedido("St. Peter's Basilica", SAO_PEDRO_ERRADO)
    assert.equal(r.coincide, false)
  })

  test('museu, museo, musei e museum são a mesma palavra', () => {
    assert.equal(correspondeAoPedido('Museu Borghese', {
      namedetails: { name: 'Museo Borghese' },
    }).coincide, true)
  })

  test('mas "Capitolinos" contra "Capitolini" não chega — e não precisa', () => {
    // O adjectivo traduzido não é uma abreviatura, e juntá-los era começar a
    // traduzir. Não faz falta: o OSM traz o nome em várias línguas, e é pelo
    // name:en que este museu é encontrado. Sozinho, o italiano não bastaria.
    assert.equal(correspondeAoPedido('Museus Capitolinos', {
      namedetails: { name: 'Musei Capitolini' },
    }).coincide, false)

    assert.equal(correspondeAoPedido('Capitoline Museums', CAPITOLINOS).coincide, true)
  })

  test('galeria e galleria', () => {
    assert.equal(correspondeAoPedido('Galeria Borghese', {
      namedetails: { name: 'Galleria Borghese' },
    }).coincide, true)
  })

  test('não se traduz — só se normaliza a mesma palavra', () => {
    // "Peter" e "Pietro" são o mesmo nome em línguas diferentes, mas juntá-los
    // era abrir a porta a confundir sítios distintos. Fica de fora de propósito.
    assert.equal(correspondeAoPedido('Saint Peter', {
      namedetails: { name: 'San Pietro' },
    }).coincide, false)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// O que o modelo põe à frente do nome
//
// "Almoço – Ristorante Il Falchetto". A comparação de nomes já ignorava o
// prefixo, mas a PROCURA levava-o: o Nominatim procura pelo texto inteiro, e o
// Il Falchetto — que tem horário no OSM — não era encontrado por causa da
// palavra "Almoço".
describe('limpar o termo antes de procurar', () => {
  test('tira o prefixo com travessão', () => {
    assert.equal(limparTermo('Almoço – Ristorante Il Falchetto'), 'Ristorante Il Falchetto')
    assert.equal(limparTermo('Jantar - Da Enzo al 29'), 'Da Enzo al 29')
    assert.equal(limparTermo('Jantar: La Pergola'), 'La Pergola')
  })

  test('tira o prefixo com preposição', () => {
    assert.equal(limparTermo('Visita ao Coliseu'), 'Coliseu')
    assert.equal(limparTermo('Almoço no Ristorante Aroma'), 'Ristorante Aroma')
    assert.equal(limparTermo('Passeio pela Via Appia'), 'Via Appia')
  })

  test('não mexe num nome que não tem prefixo', () => {
    assert.equal(limparTermo('Galleria Borghese'), 'Galleria Borghese')
    assert.equal(limparTermo('Museu Nacional do Azulejo'), 'Museu Nacional do Azulejo')
  })

  test('não corta uma palavra que faz parte do nome', () => {
    // "Visitação" começa por "visita" mas não é um prefixo — e sem separador
    // não há por onde cortar.
    assert.equal(limparTermo('Visitação de Nossa Senhora'), 'Visitação de Nossa Senhora')
  })

  test('nunca devolve vazio', () => {
    // Se o corte comesse o nome todo, ficávamos sem nada para procurar. Nesse
    // caso vale mais o original — procurar por "Almoço" não encontra, mas
    // procurar por "" nem sequer é uma pergunta.
    assert.equal(limparTermo('Almoço no'), 'Almoço no')
    assert.equal(limparTermo(''), '')
    assert.equal(limparTermo(null), '')
  })
})

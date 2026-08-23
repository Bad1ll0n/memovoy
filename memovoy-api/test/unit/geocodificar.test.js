import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { chaveDeCache, comContexto, descartarPinosForaDoDia, distanciaKm, RAIO_PLAUSIVEL_KM } from '../../src/services/geocodificar.js'

// A geocodificação vivia no browser, sem cache, a cada visita. Um roteiro de
// três dias fazia 39 pedidos ao Nominatim por visitante — os mesmos 39 outra
// vez ao seguinte. E o utilizador esperava catorze segundos pelo mapa, porque
// a política do serviço é um pedido por segundo.

describe('a chave da cache', () => {
  test('inclui a cidade, porque o nome de um lugar não é único sem ela', () => {
    // Este é o bug que motivou tudo: "Old Town" em Edimburgo e em Praga são
    // lugares diferentes. Uma chave só com o nome fundia-os numa entrada, e
    // o segundo roteiro herdava as coordenadas do primeiro.
    const edimburgo = chaveDeCache('Old Town', 'Edinburgh', 'United Kingdom')
    const praga     = chaveDeCache('Old Town', 'Prague', 'Czechia')
    assert.notEqual(edimburgo, praga)
  })

  test('não cria entradas duplicadas por causa de espaços ou maiúsculas', () => {
    // Sem normalizar, "Edinburgh Castle" e "  edinburgh  castle " são dois
    // pedidos ao Nominatim e duas linhas na tabela pelo mesmo sítio.
    assert.equal(
      chaveDeCache('Edinburgh Castle', 'Edinburgh', 'UK'),
      chaveDeCache('  edinburgh   CASTLE ', 'edinburgh', 'uk'),
    )
  })

  test('aguenta partes em falta sem produzir uma chave estranha', () => {
    const k = chaveDeCache('Torre de Belém', null, undefined)
    assert.equal(k, 'torre de belém')
  })
})

describe('a distância que decide se um resultado é plausível', () => {
  const edimburgo = { lat: 55.9533, lon: -3.1883 }

  test('dois pontos dentro de Edimburgo estão a poucos km', () => {
    const castelo = { lat: 55.9486, lon: -3.1999 }
    assert.ok(distanciaKm(edimburgo, castelo) < 2)
  })

  test('Cuba está muito para lá do limite — era isto que acontecia', () => {
    // Marcadores de um roteiro escocês apareceram sobre Cuba, porque "Old
    // Town" sem contexto procura no mundo inteiro e o Nominatim devolve o
    // primeiro que encontra.
    const cuba = { lat: 21.5, lon: -77.8 }
    const d = distanciaKm(edimburgo, cuba)
    assert.ok(d > RAIO_PLAUSIVEL_KM, `${Math.round(d)}km`)
    assert.ok(d > 6000, 'para se ver a ordem de grandeza do disparate')
  })

  test('o limite é largo o suficiente para não acusar arredores legítimos', () => {
    // Uma actividade em Sintra num roteiro de Lisboa é legítima e fica a ~25km.
    // O limite existe para apanhar outro continente, não para julgar geografia.
    const lisboa = { lat: 38.7223, lon: -9.1393 }
    const sintra = { lat: 38.8029, lon: -9.3817 }
    assert.ok(distanciaKm(lisboa, sintra) < RAIO_PLAUSIVEL_KM)
  })

  test('a distância é simétrica', () => {
    const a = { lat: 40, lon: -8 }
    const b = { lat: 41, lon: -7 }
    assert.equal(distanciaKm(a, b).toFixed(6), distanciaKm(b, a).toFixed(6))
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// A cidade duas vezes não é o dobro do contexto
//
// Acrescentávamos sempre a cidade e o país ao termo de procura. As moradas que
// o modelo escreve já os trazem, e o resultado era este:
//
//     "Via del Casaletto, 45, 00151 Roma RM, Itália, Roma, Itália"
//
// O Nominatim não devolve nada para isso. Sem a duplicação devolve a Trattoria
// da Cesare, com horário de abertura. Medido numa geração real: só 17% das
// actividades ficavam com horário conhecido, e os restaurantes eram quase todos
// os que faltavam.
describe('o contexto que se acrescenta à procura', () => {
  test('um nome simples leva cidade e país', () => {
    assert.equal(
      comContexto('Colosseum', 'Roma', 'Itália'),
      'Colosseum, Roma, Itália',
    )
  })

  test('uma morada que já os tem não os leva outra vez', () => {
    // É este o caso real que estava a falhar.
    assert.equal(
      comContexto('Via del Casaletto, 45, 00151 Roma RM, Itália', 'Roma', 'Itália'),
      'Via del Casaletto, 45, 00151 Roma RM, Itália',
    )
  })

  test('leva só o que falta', () => {
    assert.equal(comContexto('Piazza Navona, Roma', 'Roma', 'Itália'), 'Piazza Navona, Roma, Itália')
    assert.equal(comContexto('Qualquer coisa, Itália', 'Roma', 'Itália'), 'Qualquer coisa, Itália, Roma')
  })

  test('não se deixa enganar por maiúsculas', () => {
    assert.equal(comContexto('Via X, 00151 ROMA RM', 'Roma', 'Itália'), 'Via X, 00151 ROMA RM, Itália')
  })

  test('sem destino nem país, fica o termo', () => {
    assert.equal(comContexto('Colosseum', null, null), 'Colosseum')
    assert.equal(comContexto('Colosseum', undefined, undefined), 'Colosseum')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Longe do resto do dia
//
// O raio de 150 km serve para excluir outro continente e mais nada. Um jantar
// na Piazza di Santa Maria in Trastevere — morada certa — ficou geocodificado
// a 8,6 km para leste do centro de Roma, e passou: 8,6 é muito menos que 150.
//
// O que denuncia um pino errado não é a distância ao destino, é a distância ao
// RESTO DO DIA. Um dia inteiro no Vaticano com uma paragem a dez quilómetros
// não é um dia com uma paragem longe; é um pino no sítio errado.
describe('pinos que caem fora do dia', () => {
  // Coordenadas verdadeiras da zona do Vaticano.
  const diaNoVaticano = () => ({
    day: 1,
    activities: [
      { name: 'Museus do Vaticano',  type: 'visit', lat: 41.9065, lon: 12.4536 },
      { name: 'Basílica de São Pedro', type: 'visit', lat: 41.9022, lon: 12.4539 },
      { name: 'Castel Sant\'Angelo', type: 'visit', lat: 41.9031, lon: 12.4663 },
      // O caso real: morada em Trastevere, pino a leste do centro.
      { name: 'Jantar', type: 'food', lat: 41.8555, lon: 12.5741, horarioConhecido: 'Mo-Su 12:00-23:00' },
    ],
  })

  test('o pino errado perde as coordenadas', () => {
    const dia = diaNoVaticano()
    const descartados = descartarPinosForaDoDia([dia])

    assert.equal(descartados, 1)
    assert.equal(dia.activities[3].lat, null)
    assert.equal(dia.activities[3].lon, null)
  })

  test('e perde o horário com elas', () => {
    // O horário veio do mesmo resultado do Nominatim. Se o sítio está errado, o
    // horário é de outro sítio — e um horário errado é pior do que nenhum.
    const dia = diaNoVaticano()
    descartarPinosForaDoDia([dia])

    assert.equal(dia.activities[3].horarioConhecido, undefined)
  })

  test('os que estão no sítio ficam', () => {
    const dia = diaNoVaticano()
    descartarPinosForaDoDia([dia])

    for (const a of dia.activities.slice(0, 3)) {
      assert.equal(typeof a.lat, 'number', a.name)
    }
  })

  test('um dia genuinamente espalhado não se auto-acusa', () => {
    // Roma do Vaticano ao Coliseu são uns 4 km, e é um dia normal. Se a regra
    // fosse apertada de mais, dias legítimos perdiam metade dos pinos.
    const espalhado = {
      day: 1,
      activities: [
        { name: 'Vaticano', type: 'visit', lat: 41.9065, lon: 12.4536 },
        { name: 'Navona',   type: 'visit', lat: 41.8992, lon: 12.4731 },
        { name: 'Coliseu',  type: 'visit', lat: 41.8902, lon: 12.4922 },
        { name: 'Trastevere', type: 'leisure', lat: 41.8896, lon: 12.4695 },
      ],
    }
    assert.equal(descartarPinosForaDoDia([espalhado]), 0)
  })

  test('com menos de três pontos não há "resto do dia" para comparar', () => {
    // Dois pontos afastados: qual deles é o errado? Não há como saber, e
    // adivinhar deitava fora o certo metade das vezes.
    const doisPontos = {
      day: 1,
      activities: [
        { name: 'A', type: 'visit', lat: 41.9065, lon: 12.4536 },
        { name: 'B', type: 'food',  lat: 41.8555, lon: 12.5741 },
      ],
    }
    assert.equal(descartarPinosForaDoDia([doisPontos]), 0)
    assert.equal(typeof doisPontos.activities[1].lat, 'number')
  })

  test('o transporte não entra na conta', () => {
    // Uma caminhada não tem lugar próprio; contá-la puxava a mediana para um
    // ponto que não é paragem nenhuma.
    const dia = {
      day: 1,
      activities: [
        { name: 'A', type: 'visit', lat: 41.9065, lon: 12.4536 },
        { name: 'Caminhada', type: 'transport', lat: 41.7000, lon: 12.9000 },
        { name: 'B', type: 'visit', lat: 41.9022, lon: 12.4539 },
        { name: 'C', type: 'visit', lat: 41.9031, lon: 12.4663 },
      ],
    }
    descartarPinosForaDoDia([dia])
    assert.equal(dia.activities[1].lat, 41.7, 'o transporte fica como está')
  })

  test('actividades sem coordenadas não estorvam', () => {
    const dia = {
      day: 1,
      activities: [
        { name: 'A', type: 'visit', lat: 41.9065, lon: 12.4536 },
        { name: 'sem', type: 'visit', lat: null, lon: null },
        { name: 'B', type: 'visit', lat: 41.9022, lon: 12.4539 },
        { name: 'C', type: 'visit', lat: 41.9031, lon: 12.4663 },
      ],
    }
    assert.equal(descartarPinosForaDoDia([dia]), 0)
  })
})

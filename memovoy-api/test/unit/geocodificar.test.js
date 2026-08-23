import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { chaveDeCache, comContexto, distanciaKm, RAIO_PLAUSIVEL_KM } from '../../src/services/geocodificar.js'

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

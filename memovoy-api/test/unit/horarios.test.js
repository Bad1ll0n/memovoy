import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { avaliarHorario, ABERTO, FECHADO, DESCONHECIDO } from '../../src/services/horarios.js'

// Numa geração real apareceram os Museus do Vaticano marcados para as 18:05, e
// fecham às 18:00. O modelo não tem como saber isto de forma fiável.
//
// Os horários abaixo NÃO são inventados: foram obtidos do OpenStreetMap, pelo
// Nominatim, no mesmo pedido que já fazemos para geocodificar.

const PANTEAO   = 'Mo-Sa 08:30-19:15; Su 09:00-17:45'
const BORGHESE  = 'Tu-Su 09:00-19:00'
const COLISEU   = 'Nov 01-Feb 15: 08:30-16:30; Feb 16-Mar 31: 08:30-17:00; Apr-Aug: 08:30-19:15; Sep: 08:30-19:00; Oct 08:30-18:30; May 01 off; Jan 01 off; Dec 25 off'

// 2026-10-05 é uma segunda-feira; 06 terça; 11 domingo.
const SEGUNDA = '2026-10-05'
const TERCA   = '2026-10-06'
const DOMINGO = '2026-10-11'

describe('o caso que motivou isto', () => {
  test('uma visita que começa depois da hora de fecho é apanhada', () => {
    // Museus do Vaticano às 18:05, com fecho às 18:00.
    const r = avaliarHorario('Mo-Sa 09:00-18:00', TERCA, '18:05', 120)

    assert.equal(r.estado, FECHADO)
    assert.match(r.motivo, /já fechou/)
  })

  test('uma visita que COMEÇA a horas mas acaba depois do fecho também', () => {
    // É o erro mais fácil de deixar passar: às 17:00 está aberto, mas duas
    // horas de museu passam das 18:00.
    const r = avaliarHorario('Mo-Sa 09:00-18:00', TERCA, '17:00', 120)

    assert.equal(r.estado, FECHADO)
    assert.match(r.motivo, /passa da hora de fecho/)
  })

  test('a mesma visita mais curta cabe', () => {
    assert.equal(avaliarHorario('Mo-Sa 09:00-18:00', TERCA, '17:00', 45).estado, ABERTO)
  })
})

describe('dias da semana', () => {
  test('a Galleria Borghese fecha à segunda-feira', () => {
    // "Tu-Su" não inclui Mo. É o género de coisa que estraga um dia inteiro e
    // que ninguém confirma antes de ir.
    const r = avaliarHorario(BORGHESE, SEGUNDA, '10:00', 120)

    assert.equal(r.estado, FECHADO)
    assert.match(r.motivo, /segunda/)
  })

  test('e abre de terça a domingo', () => {
    assert.equal(avaliarHorario(BORGHESE, TERCA, '10:00', 120).estado, ABERTO)
    assert.equal(avaliarHorario(BORGHESE, DOMINGO, '10:00', 120).estado, ABERTO)
  })

  test('o Panteão tem horário diferente ao domingo', () => {
    // Mo-Sa até às 19:15, Su até às 17:45. Uma visita às 18:00 passa num dia e
    // falha no outro — e a regra do domingo vem depois, portanto ganha.
    assert.equal(avaliarHorario(PANTEAO, TERCA, '18:00', 30).estado, ABERTO)
    assert.equal(avaliarHorario(PANTEAO, DOMINGO, '18:00', 30).estado, FECHADO)
  })
})

describe('horários por estação, como o do Coliseu', () => {
  test('em Outubro fecha às 18:30', () => {
    assert.equal(avaliarHorario(COLISEU, '2026-10-06', '17:00', 90).estado, ABERTO)
    assert.equal(avaliarHorario(COLISEU, '2026-10-06', '18:00', 90).estado, FECHADO)
  })

  test('em Dezembro fecha às 16:30, e a mesma hora deixa de servir', () => {
    // A janela de Inverno é duas horas mais curta. Um roteiro de Dezembro com
    // as horas de Agosto manda alguém para uma porta fechada.
    assert.equal(avaliarHorario(COLISEU, '2026-12-10', '15:00', 90).estado, ABERTO)
    assert.equal(avaliarHorario(COLISEU, '2026-12-10', '16:00', 90).estado, FECHADO)
  })

  test('o Natal está fechado, apesar de Dezembro ter uma regra de horas', () => {
    // "Dec 25 off" vem depois de "Nov 01-Feb 15: 08:30-16:30". As regras leem-se
    // por ordem e a última que se aplica ganha — se fosse a primeira, o Natal
    // aparecia aberto.
    const r = avaliarHorario(COLISEU, '2026-12-25', '10:00', 90)

    assert.equal(r.estado, FECHADO)
  })

  test('e o primeiro de Maio também', () => {
    assert.equal(avaliarHorario(COLISEU, '2026-05-01', '10:00', 90).estado, FECHADO)
    assert.equal(avaliarHorario(COLISEU, '2026-05-02', '10:00', 90).estado, ABERTO)
  })
})

describe('o que se recusa a adivinhar', () => {
  // Esta é a decisão mais importante do módulo. Dizer "fechado" a quem está
  // aberto manda deitar fora uma visita boa, e o utilizador não tem como saber
  // que fomos nós que nos enganámos.

  test('sem etiqueta nenhuma, não se sabe', () => {
    assert.equal(avaliarHorario(null, TERCA, '10:00', 60).estado, DESCONHECIDO)
    assert.equal(avaliarHorario('', TERCA, '10:00', 60).estado, DESCONHECIDO)
  })

  test('feriados públicos não se sabem calcular, e diz-se isso', () => {
    // "PH off" precisa do calendário de feriados do país. Fingir que se sabe
    // era pior do que admitir que não.
    assert.equal(avaliarHorario('Mo-Su 09:00-18:00; PH off', TERCA, '10:00', 60).estado, DESCONHECIDO)
  })

  test('horas relativas ao sol também não', () => {
    assert.equal(avaliarHorario('Mo-Su 09:00-sunset', TERCA, '10:00', 60).estado, DESCONHECIDO)
  })

  test('uma regra que não se percebe invalida a leitura inteira', () => {
    // Ler metade e decidir com essa metade era o pior dos mundos: parece que
    // se sabe e está errado.
    assert.equal(avaliarHorario('Mo-Su 09:00-18:00; qualquer coisa estranha', TERCA, '10:00', 60).estado, DESCONHECIDO)
  })

  test('uma data mal formada não deita nada abaixo', () => {
    assert.equal(avaliarHorario(PANTEAO, 'ontem', '10:00', 60).estado, DESCONHECIDO)
    assert.equal(avaliarHorario(PANTEAO, TERCA, '25:00', 60).estado, DESCONHECIDO)
  })
})

describe('casos simples que têm de funcionar', () => {
  test('24/7 está sempre aberto', () => {
    assert.equal(avaliarHorario('24/7', SEGUNDA, '03:00', 60).estado, ABERTO)
  })

  test('dois intervalos no mesmo dia, com pausa de almoço', () => {
    const h = 'Mo-Fr 09:00-12:30,14:00-18:00'

    assert.equal(avaliarHorario(h, TERCA, '10:00', 60).estado, ABERTO)
    assert.equal(avaliarHorario(h, TERCA, '15:00', 60).estado, ABERTO)
    // A pausa é mesmo uma pausa.
    assert.equal(avaliarHorario(h, TERCA, '13:00', 30).estado, FECHADO)
    // E uma visita não pode atravessá-la.
    assert.equal(avaliarHorario(h, TERCA, '12:00', 120).estado, FECHADO)
  })

  test('dias enumerados, não só intervalos', () => {
    const h = 'Mo,We,Fr 10:00-16:00'

    assert.equal(avaliarHorario(h, '2026-10-05', '11:00', 60).estado, ABERTO)  // segunda
    assert.equal(avaliarHorario(h, '2026-10-06', '11:00', 60).estado, FECHADO) // terça
    assert.equal(avaliarHorario(h, '2026-10-07', '11:00', 60).estado, ABERTO)  // quarta
  })

  test('um intervalo de dias que dá a volta ao fim de semana', () => {
    const h = 'Sa-Mo 10:00-16:00'

    assert.equal(avaliarHorario(h, '2026-10-10', '11:00', 60).estado, ABERTO)  // sábado
    assert.equal(avaliarHorario(h, '2026-10-11', '11:00', 60).estado, ABERTO)  // domingo
    assert.equal(avaliarHorario(h, '2026-10-05', '11:00', 60).estado, ABERTO)  // segunda
    assert.equal(avaliarHorario(h, '2026-10-07', '11:00', 60).estado, FECHADO) // quarta
  })

  test('sem duração, só a hora de início conta', () => {
    assert.equal(avaliarHorario('Mo-Su 09:00-18:00', TERCA, '17:59', 0).estado, ABERTO)
  })
})

import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import {
  HORA_INICIO_OMISSAO,
  HORA_FIM_OMISSAO,
  horaValida,
  emMinutos,
} from '../../src/services/aiAgent.js'

// O agente escolhia as horas sozinho e escolhia sempre parecido: manhã cedo até
// à noite. Quem viaja com crianças, chega num voo da tarde, ou simplesmente não
// se levanta às oito, recebia um roteiro errado de raiz — e corrigi-lo era
// editar actividade a actividade.

describe('as horas por omissão', () => {
  test('são as que o agente já usava, não uma preferência nova', () => {
    // Isto importa: quem não mexer nos campos tem de receber exactamente o
    // roteiro que receberia antes desta funcionalidade existir. Se estes
    // valores mudarem, muda o comportamento de toda a gente que nunca pediu
    // nada — e ninguém saberá porquê.
    assert.equal(HORA_INICIO_OMISSAO, '09:00')
    assert.equal(HORA_FIM_OMISSAO, '22:00')
  })

  test('formam uma janela válida', () => {
    assert.ok(horaValida(HORA_INICIO_OMISSAO))
    assert.ok(horaValida(HORA_FIM_OMISSAO))
    assert.ok(emMinutos(HORA_FIM_OMISSAO) > emMinutos(HORA_INICIO_OMISSAO))
  })
})

describe('o que conta como hora', () => {
  test('aceita horas reais, incluindo as extremas', () => {
    for (const h of ['00:00', '09:00', '13:45', '23:59']) {
      assert.ok(horaValida(h), h)
    }
  })

  test('recusa o que parece hora mas não é', () => {
    // '24:00' é o caso interessante: lê-se como meia-noite e existe em ISO
    // 8601, mas um <input type="time"> nunca o produz e a coluna TIME
    // recusa-o. Aceitá-lo aqui era deixar passar um valor que rebenta
    // mais abaixo, longe de onde entrou.
    for (const h of ['24:00', '9:00', '09:60', '0900', '09:0', 'manhã', '', null, undefined, 900]) {
      assert.ok(!horaValida(h), String(h))
    }
  })
})

describe('comparar horas', () => {
  test('meia-noite é zero e a comparação é numérica, não alfabética', () => {
    // Como strings, '09:00' > '10:00' é falso mas '9:00' > '10:00' é
    // verdadeiro. Comparar horas como texto funciona por acidente enquanto
    // houver o zero à frente, e falha em silêncio quando não houver.
    assert.equal(emMinutos('00:00'), 0)
    assert.equal(emMinutos('09:30'), 570)
    assert.equal(emMinutos('23:59'), 1439)
    assert.ok(emMinutos('09:00') < emMinutos('10:00'))
  })

  test('a duração de uma janela sai de uma subtracção', () => {
    assert.equal(emMinutos('22:00') - emMinutos('09:00'), 780)  // 13 horas
    assert.equal(emMinutos('12:00') - emMinutos('09:30'), 150)  // 2h30
  })
})

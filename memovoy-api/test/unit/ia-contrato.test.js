import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { repararDias, _repararActividade as repararActividade } from '../../src/services/aiAgent.js'

// Contrato entre o modelo e a base de dados.
//
// Dezoito agentes, e nenhum verificava a forma do que o modelo devolvia. O
// `days` ia para a coluna JSONB com um `?? []` pelo meio.
//
// Isto não é hipotético: um roteiro cujo dia não tinha `activities`, ou em que
// `activities` era uma string, fazia o POST /activity responder 500 — no push e
// no sort. E como os endpoints de edição validam com zod, a IA podia gerar uma
// actividade que o utilizador depois não conseguia editar.
//
// A regra é reparar, não rejeitar: deitar fora um roteiro inteiro porque uma
// actividade em vinte veio sem `tips` seria pior para quem está à espera dele.

describe('reparar dias', () => {
  test('uma resposta bem formada passa sem alterações de fundo', () => {
    const dias = repararDias([{
      day: 1, theme: 'Centro',
      activities: [{
        time: '10:00', name: 'Torre', description: 'Vista', type: 'visit',
        currency: 'EUR', cost: 12, address: 'Belém', geoName: 'Tower', tips: 'Cedo',
      }],
    }])

    assert.equal(dias.length, 1)
    assert.equal(dias[0].theme, 'Centro', 'campos que não conhecemos ficam')
    assert.deepEqual(dias[0].activities[0], {
      time: '10:00', name: 'Torre', description: 'Vista', address: 'Belém',
      geoName: 'Tower', cost: 12, currency: 'EUR', type: 'visit', tips: 'Cedo',
    })
  })

  test('um dia sem activities fica com uma lista vazia', () => {
    // Era isto que dava 500 no POST /activity: o push sobre undefined.
    const dias = repararDias([{ day: 1, theme: 'x' }])

    assert.deepEqual(dias[0].activities, [])
  })

  test('activities que não é um array também', () => {
    const dias = repararDias([{ day: 1, activities: 'ups' }])

    assert.deepEqual(dias[0].activities, [])
  })

  test('days que não é um array lança', () => {
    // Aqui não há nada a reparar — vale mais falhar com uma mensagem do que
    // gravar lixo e descobrir mais tarde.
    assert.throws(() => repararDias('ups'), /lista de dias/)
    assert.throws(() => repararDias(null), /lista de dias/)
    assert.throws(() => repararDias({ days: [] }), /lista de dias/)
  })

  test('entradas que não são objectos são descartadas', () => {
    const dias = repararDias([{ day: 1, activities: [] }, 'lixo', null, 42, ['x']])

    assert.equal(dias.length, 1)
  })

  test('o número do dia é preenchido quando falta', () => {
    const dias = repararDias([{ activities: [] }, { activities: [] }])

    assert.equal(dias[0].day, 1)
    assert.equal(dias[1].day, 2)
  })
})

describe('reparar actividades', () => {
  test('sem nome não há actividade que salvar', () => {
    assert.equal(repararActividade({ time: '10:00', description: 'x' }), null)
    assert.equal(repararActividade({ name: '   ' }), null)
    assert.equal(repararActividade({ name: 42 }), null)
  })

  test('uma actividade sem nome é retirada do dia, não deita o dia fora', () => {
    const dias = repararDias([{
      activities: [
        { name: 'Boa', time: '10:00' },
        { description: 'sem nome' },
        { name: 'Outra', time: '14:00' },
      ],
    }])

    assert.equal(dias[0].activities.length, 2)
    assert.deepEqual(dias[0].activities.map((a) => a.name), ['Boa', 'Outra'])
  })

  test('hora inválida cai para uma por omissão em vez de rebentar', () => {
    // O dia é ordenado por `time` com localeCompare. Uma hora em falta fazia
    // isso rebentar — ou passar por sorte, consoante a ordem da comparação.
    for (const time of [undefined, null, 'de manhã', '', 42, {}]) {
      assert.equal(repararActividade({ name: 'X', time }).time, '09:00')
    }
  })

  test('hora com um dígito é normalizada para HH:MM', () => {
    // O endpoint de edição exige HH:MM. Se a IA gerar 9:30, a actividade que
    // ela criou deixava de poder ser editada à mão.
    assert.equal(repararActividade({ name: 'X', time: '9:30' }).time, '09:30')
  })

  test('tipo desconhecido cai para visit', () => {
    assert.equal(repararActividade({ name: 'X', type: 'inventado' }).type, 'visit')
    assert.equal(repararActividade({ name: 'X' }).type, 'visit')
    assert.equal(repararActividade({ name: 'X', type: 'food' }).type, 'food')
  })

  test('custo não numérico passa a null', () => {
    for (const cost of ['12', NaN, Infinity, {}, null]) {
      assert.equal(repararActividade({ name: 'X', cost }).cost, null)
    }
    assert.equal(repararActividade({ name: 'X', cost: 0 }).cost, 0, 'zero é um custo válido')
  })

  test('a moeda cai para a do roteiro, não para uma fixa', () => {
    const dias = repararDias([{ activities: [{ name: 'X' }] }], 'GBP')

    assert.equal(dias[0].activities[0].currency, 'GBP')
  })

  test('textos longos são cortados aos limites que a edição aceita', () => {
    const a = repararActividade({
      name: 'n'.repeat(500),
      description: 'd'.repeat(2000),
    })

    assert.equal(a.name.length, 200)
    assert.equal(a.description.length, 500)
  })

  test('campos opcionais em branco ficam null, não string vazia', () => {
    const a = repararActividade({ name: 'X', address: '   ', tips: '', geoName: null })

    assert.equal(a.address, null)
    assert.equal(a.tips, null)
    assert.equal(a.geoName, null)
  })

  test('a descrição em falta fica string vazia, não null', () => {
    // O schema da edição exige uma string aqui; null faria a validação recusar
    // uma actividade que a própria aplicação gerou.
    assert.equal(repararActividade({ name: 'X' }).description, '')
  })
})

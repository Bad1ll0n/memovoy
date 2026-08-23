import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import {
  medirDia, diasPorPreencher, resumirAgenda,
  emMinutos, paraHoras, refeicoesEmFalta, COBERTURA_MINIMA, DESLOCACAO_MIN,
} from '../../src/services/agenda.js'

// A regra antiga pedia "4 a 6 actividades" e as refeições contavam. Com almoço
// e jantar obrigatórios sobravam duas visitas por dia — e o modelo cumpria a
// instrução enquanto entregava um dia a meio.
//
// Este é o dia 3 do roteiro de Roma que motivou a mudança, tal como veio:
// janela das 09:00 às 22:00, quatro entradas, e seis horas sem nada.
const DIA_DE_ROMA = {
  day: 3,
  theme: 'Trastevere',
  activities: [
    { time: '09:30', durationMin: 30,  name: 'Basílica de Santa Maria em Trastevere', type: 'visit' },
    { time: '12:30', durationMin: 90,  name: 'Almoço no Da Enzo al 29',               type: 'food'  },
    { time: '14:30', durationMin: 60,  name: 'Jardins do Orto Botanico',              type: 'leisure' },
    { time: '19:30', durationMin: 120, name: 'Jantar no Taverna Trilussa',            type: 'food'  },
  ],
}

describe('medir um dia pelas horas, não pelas actividades', () => {
  test('o dia de Roma tinha quatro actividades e estava a menos de metade', () => {
    // É este número que a contagem de actividades escondia: quatro entradas
    // parecem um dia composto, e 300 minutos numa janela de 780 não são.
    const m = medirDia(DIA_DE_ROMA, '09:00', '22:00')

    assert.equal(m.janela, 780)
    assert.ok(m.cobertura < 0.5, `cobertura ${(m.cobertura * 100).toFixed(0)}%`)
    assert.ok(m.vazio > 400, `${m.vazio} minutos vazios`)
  })

  test('e é assim que se descobre que precisa de ser completado', () => {
    const fracos = diasPorPreencher([DIA_DE_ROMA], '09:00', '22:00')

    assert.equal(fracos.length, 1)
    assert.equal(fracos[0].dia, 3)
  })

  test('aponta ONDE está o vazio, não só que existe', () => {
    // Sem isto, pedir ao modelo que complete o dia era pedir às cegas. Com
    // isto diz-se "faltam cinco horas depois do Orto Botanico".
    const m = medirDia(DIA_DE_ROMA, '09:00', '22:00')

    assert.ok(m.buracos.length >= 2)
    const nomes = m.buracos.map((b) => b.depoisDe)
    assert.ok(nomes.some((n) => /Santa Maria/.test(n)))
    assert.ok(nomes.some((n) => /Orto Botanico/.test(n)))
  })

  test('um dia bem composto passa, com menos actividades do que o de Roma', () => {
    // Cinco entradas contra as quatro de Roma, mas o que o faz passar é as
    // durações somarem, não serem cinco. Um dia de três actividades longas
    // passaria na mesma.
    const bom = {
      day: 1,
      activities: [
        { time: '09:00', durationMin: 210, name: 'Museu grande',  type: 'visit' },
        { time: '12:45', durationMin: 75,  name: 'Almoço',        type: 'food'  },
        { time: '14:15', durationMin: 120, name: 'Monumento',     type: 'visit' },
        { time: '16:30', durationMin: 90,  name: 'Passeio',       type: 'leisure' },
        { time: '19:30', durationMin: 110, name: 'Jantar',        type: 'food'  },
      ],
    }
    const m = medirDia(bom, '09:00', '22:00')

    assert.ok(m.cobertura >= COBERTURA_MINIMA, `cobertura ${(m.cobertura * 100).toFixed(0)}%`)
    assert.equal(diasPorPreencher([bom], '09:00', '22:00').length, 0)
  })
})

describe('o que a medição tem de apanhar', () => {
  test('uma actividade sem duração é assinalada, não assumida', () => {
    // Inventar uma duração aqui escondia exactamente o que se quer ver. Conta
    // como zero e diz-se porquê.
    const m = medirDia({
      activities: [{ time: '10:00', name: 'Sem duração', type: 'visit' }],
    }, '09:00', '22:00')

    assert.equal(m.ocupado, 0)
    assert.ok(m.problemas.some((p) => /não diz quanto tempo/.test(p)))
  })

  test('uma actividade que passa da hora de fim é apanhada', () => {
    const m = medirDia({
      activities: [{ time: '21:00', durationMin: 180, name: 'Jantar longo', type: 'food' }],
    }, '09:00', '22:00')

    assert.ok(m.problemas.some((p) => /depois de 22:00/.test(p)))
  })

  test('duas actividades sobrepostas são apanhadas', () => {
    // O modelo pode pôr duas coisas à mesma hora sem dar por isso. Como o dia
    // passou a ser medido por soma, isto até INFLACIONA a cobertura — seria
    // uma forma de o dia passar na verificação estando errado.
    const m = medirDia({
      activities: [
        { time: '10:00', durationMin: 180, name: 'Museu',  type: 'visit' },
        { time: '11:00', durationMin: 60,  name: 'Almoço', type: 'food'  },
      ],
    }, '09:00', '22:00')

    assert.ok(m.problemas.some((p) => /ainda decorre quando/.test(p)))
  })

  test('a deslocação entre paragens conta, mas não mais do que o intervalo', () => {
    // Duas actividades encostadas não gastam quinze minutos a andar. Se
    // gastassem, um dia apertado passava a parecer mais cheio do que está.
    const encostadas = medirDia({
      activities: [
        { time: '10:00', durationMin: 60, name: 'A', type: 'visit' },
        { time: '11:05', durationMin: 60, name: 'B', type: 'visit' },
      ],
    }, '09:00', '22:00')

    // 120 de visitas + 5 de intervalo, não 120 + 15.
    assert.equal(encostadas.ocupado, 125)

    const afastadas = medirDia({
      activities: [
        { time: '10:00', durationMin: 60, name: 'A', type: 'visit' },
        { time: '12:00', durationMin: 60, name: 'B', type: 'visit' },
      ],
    }, '09:00', '22:00')

    assert.equal(afastadas.ocupado, 120 + DESLOCACAO_MIN)
  })

  test('uma janela invertida não conta como dia cheio', () => {
    // A rota já recusa isto, mas se alguma vez lá chegar, dividir por uma
    // janela de zero dava NaN — e NaN < 0.7 é falso, portanto o dia passava.
    const m = medirDia(DIA_DE_ROMA, '22:00', '09:00')

    assert.equal(m.janela, 0)
    assert.equal(m.cobertura, 0)
    assert.equal(diasPorPreencher([DIA_DE_ROMA], '22:00', '09:00').length, 0)
  })

  test('uma janela curta enche-se com pouco', () => {
    // Quem chega num voo da tarde tem quatro horas, não treze. Duas
    // actividades bem medidas chegam para encher — e a regra antiga teria
    // pedido quatro a seis à mesma.
    const tarde = {
      activities: [
        { time: '14:00', durationMin: 90, name: 'Visita', type: 'visit' },
        { time: '16:00', durationMin: 90, name: 'Jantar cedo', type: 'food' },
      ],
    }
    const m = medirDia(tarde, '14:00', '18:00')

    assert.ok(m.cobertura >= COBERTURA_MINIMA, `cobertura ${(m.cobertura * 100).toFixed(0)}%`)
  })
})

describe('as horas em texto', () => {
  test('minutos redondos não levam zeros a mais', () => {
    assert.equal(paraHoras(120), '2h')
    assert.equal(paraHoras(150), '2h30')
    assert.equal(paraHoras(65), '1h05')
  })

  test('converter horas é o inverso', () => {
    assert.equal(emMinutos('09:30'), 570)
    assert.equal(emMinutos('24:00'), null, 'não existe')
    assert.equal(emMinutos('nove'), null)
  })
})

describe('o resumo que vai para os registos', () => {
  test('diz a cobertura de cada dia em percentagem', () => {
    // Sem isto a verificação era silenciosa: só se saberia que um dia ficou a
    // meio indo ver o roteiro depois de gerado.
    const r = resumirAgenda([DIA_DE_ROMA], '09:00', '22:00')

    assert.equal(r.length, 1)
    assert.equal(r[0].dia, 3)
    assert.equal(r[0].actividades, 4)
    assert.match(r[0].cobertura, /^\d+%$/)
    assert.ok(Number.parseInt(r[0].cobertura, 10) < 50)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// A refeição que se perdeu a caminho
//
// Isto não é sobre tempo, mas apareceu ao medir tempo. Quando o prompt passou a
// exigir o dia cheio, uma das gerações reais entregou um dia 1 a 95% de
// cobertura — e sem almoço nenhum. O modelo deitou-o fora para arranjar espaço.
//
// Um dia a 95% sem o almoço que o utilizador pediu não é um dia bom. É um
// número bom. Encher o dia não pode custar o que foi pedido explicitamente.
describe('as refeições pedidas não podem desaparecer para o dia caber', () => {
  const comAlmocoEJantar = {
    activities: [
      { time: '09:00', durationMin: 120, name: 'Museu',  type: 'visit' },
      { time: '13:00', durationMin: 80,  name: 'Almoço', type: 'food'  },
      { time: '19:30', durationMin: 110, name: 'Jantar', type: 'food'  },
    ],
  }

  test('um dia completo não acusa nada', () => {
    assert.deepEqual(refeicoesEmFalta(comAlmocoEJantar, ['lunch', 'dinner']), [])
  })

  test('o almoço em falta é apanhado', () => {
    // O caso real: só jantar, às 18:20, e nada entre as nove e as seis.
    const semAlmoco = {
      activities: [
        { time: '09:00', durationMin: 180, name: 'Coliseu', type: 'visit' },
        { time: '12:10', durationMin: 150, name: 'Fórum',   type: 'visit' },
        { time: '18:20', durationMin: 120, name: 'Jantar',  type: 'food'  },
      ],
    }
    assert.deepEqual(refeicoesEmFalta(semAlmoco, ['lunch', 'dinner']), ['lunch'])
  })

  test('a hora é o que distingue um almoço de um jantar', () => {
    // O modelo marca ambos como `food`. Sem olhar às horas, um jantar às 15:15
    // — que aconteceu — contaria como almoço e como jantar ao mesmo tempo.
    const jantarCedo = {
      activities: [{ time: '15:15', durationMin: 105, name: 'Jantar', type: 'food' }],
    }
    assert.deepEqual(refeicoesEmFalta(jantarCedo, ['lunch', 'dinner']), ['dinner'])
  })

  test('não se queixa de refeições que ninguém pediu', () => {
    // Quem não pediu pequeno-almoço não quer ver um aviso sobre ele.
    assert.deepEqual(refeicoesEmFalta(comAlmocoEJantar, ['lunch']), [])
    assert.deepEqual(refeicoesEmFalta(comAlmocoEJantar, []), [])
  })

  test('uma visita à hora de almoço não conta como almoço', () => {
    const almocoQueNaoEComida = {
      activities: [{ time: '13:00', durationMin: 90, name: 'Mercado', type: 'visit' }],
    }
    assert.deepEqual(refeicoesEmFalta(almocoQueNaoEComida, ['lunch']), ['lunch'])
  })
})

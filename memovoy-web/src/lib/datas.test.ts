import { describe, test, expect } from 'vitest'
import { formatarData, formatarIntervalo } from './datas'

// A página de um roteiro contradizia-se: o título dizia "2027-05-10" e o
// cabeçalho dizia "9/05/2027". As datas dos dias vivem no JSONB como texto e
// nunca deslizaram; as de início e fim vinham de colunas DATE, que o driver
// convertia para meia-noite do fuso do SERVIDOR — em Portugal, em Maio, isso é
// 23:00 do dia anterior em UTC.
//
// A raiz foi corrigida no driver (src/db/pool.js). Aqui garante-se a outra
// metade: dado o texto certo, a formatação devolve o dia certo.

describe('formatar um dia do calendário', () => {
  test('devolve o dia que lá está, não o anterior', () => {
    // O caso exacto do bug.
    expect(formatarData('2027-05-10')).toContain('10')
    expect(formatarData('2027-05-10')).not.toContain('9 ')
  })

  test('não desliza em nenhum dia do ano', () => {
    // Se a formatação dependesse do fuso, seriam os dias 1 de cada mês a
    // partir para o mês anterior — e passar em Maio não diria nada sobre
    // Dezembro, porque o horário de verão muda o desvio a meio do ano.
    for (const mes of ['01', '02', '03', '06', '07', '10', '12']) {
      const iso = `2027-${mes}-01`
      const saida = formatarData(iso)
      expect(saida, `${iso} → ${saida}`).toMatch(/\b1\b/)
    }
  })

  test('aguenta o último dia do ano sem saltar para o ano errado', () => {
    // Com um desvio de uma hora para trás, 1 de Janeiro vira 31 de Dezembro
    // do ano ANTERIOR. É o erro mais visível e o mais fácil de não testar.
    expect(formatarData('2027-01-01')).toContain('2027')
    expect(formatarData('2027-12-31')).toContain('2027')
  })

  test('mostra o mesmo dia a quem abre a página em qualquer parte do mundo', () => {
    // Este é o teste que interessa, e é o que faltava.
    //
    // O PostCard formatava sem fixar o fuso, e por isso o dia dependia de onde
    // o visitante estivesse. Medido com '2027-05-10':
    //
    //     Lisboa, Tóquio, UTC     10/05/2027   ok
    //     São Paulo, Nova Iorque   9/05/2027   errado
    //     Honolulu                 9/05/2027   errado
    //
    // Correr a suite em Portugal nunca apanharia isto — passava sempre. Por
    // isso o teste não pergunta em que fuso está a correr: compara o que a
    // função devolve com o que um formatador daria em fusos aos dois lados de
    // UTC, e exige que sejam todos o mesmo dia.
    const iso = '2027-05-10'
    const opcoes = (timeZone: string): Intl.DateTimeFormatOptions =>
      ({ day: 'numeric', month: 'short', year: 'numeric', timeZone })
    const em = (timeZone: string) => new Date(iso).toLocaleDateString('pt-PT', opcoes(timeZone))

    // Primeiro, provar que a escolha do fuso se NOTA. Sem isto o resto do teste
    // passaria mesmo que o fuso fosse irrelevante, e não valeria nada.
    expect(em('UTC')).not.toBe(em('Pacific/Honolulu'))

    // Agora o que interessa: a nossa função dá o dia do calendário, e não o
    // que se veria de um fuso a oeste — que é o que o PostCard mostrava.
    expect(formatarData(iso)).toBe(em('UTC'))
    expect(formatarData(iso)).not.toBe(em('Pacific/Honolulu'))
    expect(formatarData(iso)).toMatch(/\b10\b/)
  })

  test('nada dentro, nada fora', () => {
    expect(formatarData(null)).toBe('')
    expect(formatarData(undefined)).toBe('')
    expect(formatarData('')).toBe('')
  })

  test('uma data impossível não escreve "Invalid Date" na página', () => {
    // É o que aparecia antes de haver esta guarda: o utilizador via as
    // palavras "Invalid Date" no meio do cartão.
    expect(formatarData('nem-uma-data')).toBe('')
    expect(formatarData('2027-13-45')).toBe('')
  })
})

describe('formatar um intervalo', () => {
  test('junta as duas com uma seta', () => {
    const r = formatarIntervalo('2027-05-10', '2027-05-12')
    expect(r).toContain('→')
    expect(r).toContain('10')
    expect(r).toContain('12')
  })

  test('sem fim, mostra só o início', () => {
    const r = formatarIntervalo('2027-05-10', null)
    expect(r).not.toContain('→')
    expect(r).toContain('10')
  })

  test('sem início, não mostra nada', () => {
    // Um intervalo que começa em lado nenhum não é um intervalo. Mostrar só a
    // data de fim daria a entender que a viagem acaba sem ter começado.
    expect(formatarIntervalo(null, '2027-05-12')).toBe('')
  })
})

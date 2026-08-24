import { describe, test, expect } from 'vitest'
import { activityTypeColor, comoChamarAoSite, pesquisaDeBilhetes, distanciaEntre, distanciaLegivel, duracaoLegivel, numerarParagens, type Activity } from './actividade'

// Um mapa com pinos mostra que os sítios existem; não mostra se dois estão a
// duzentos metros ou a três quilómetros um do outro. Num roteiro a pé é essa a
// pergunta — e sem resposta, um dia que atravessa a cidade duas vezes parece
// igual a um dia que se faz num bairro.

const em = (lat: number, lon: number, type: Activity['type'] = 'visit'): Activity => ({
  time: '10:00', name: 'x', description: '', address: null,
  cost: null, currency: 'EUR', type, tips: null, lat, lon,
})

// Coordenadas verdadeiras, para os números serem verificáveis.
const COLISEU   = em(41.8902, 12.4922)
const FORUM     = em(41.8925, 12.4853)   // ~600 m do Coliseu
const VATICANO  = em(41.9065, 12.4536)   // ~3,5 km
const TRASTEVERE = em(41.8896, 12.4695)

describe('a distância entre duas paragens', () => {
  test('Coliseu ao Fórum Romano são poucas centenas de metros', () => {
    const d = distanciaEntre(COLISEU, FORUM)
    expect(d).toBeGreaterThan(400)
    expect(d).toBeLessThan(900)
  })

  test('Coliseu ao Vaticano são uns três quilómetros e meio', () => {
    const d = distanciaEntre(COLISEU, VATICANO)!
    expect(d).toBeGreaterThan(3000)
    expect(d).toBeLessThan(4200)
  })

  test('é simétrica', () => {
    expect(distanciaEntre(COLISEU, TRASTEVERE)).toBe(distanciaEntre(TRASTEVERE, COLISEU))
  })

  test('sem coordenadas não se inventa uma distância', () => {
    // Metade das actividades de um roteiro pode não ter coordenadas. Devolver
    // zero seria dizer "estão no mesmo sítio", que é pior do que não dizer.
    const semCoords = { ...COLISEU, lat: null, lon: null }
    expect(distanciaEntre(semCoords, FORUM)).toBe(null)
    expect(distanciaEntre(COLISEU, semCoords)).toBe(null)
  })
})

describe('como a distância se lê', () => {
  test('abaixo de um quilómetro, em metros', () => {
    expect(distanciaLegivel(450)).toContain('450 m')
    expect(distanciaLegivel(999)).toContain('999 m')
  })

  test('acima, em quilómetros com vírgula decimal', () => {
    // Vírgula e não ponto: é português.
    expect(distanciaLegivel(2340)).toContain('2,3 km')
    expect(distanciaLegivel(12000)).toContain('12,0 km')
  })

  test('dois passos não são uma distância', () => {
    // Um restaurante em frente ao museu não precisa de uma linha a dizer
    // "30 m". Só faz barulho.
    expect(distanciaLegivel(30)).toBe(null)
    expect(distanciaLegivel(0)).toBe(null)
    expect(distanciaLegivel(null)).toBe(null)
  })

  test('acrescenta o tempo a pé quando vale a pena dizê-lo', () => {
    expect(distanciaLegivel(1500)).toMatch(/≈\d+ min a pé/)

    // A fronteira está nos três minutos, que a 4,5 km/h são uns 225 metros.
    // Abaixo disso a distância já diz tudo: "120 m · ≈2 min a pé" não
    // acrescenta nada a "120 m".
    expect(distanciaLegivel(120)).toBe('120 m')
    expect(distanciaLegivel(200)).toContain('min')   // 2,7 min arredonda para 3
  })

  test('o tempo a pé é plausível', () => {
    // 4,5 km/h é o ritmo de quem passeia. Um quilómetro dá uns treze minutos.
    const r = distanciaLegivel(1000)!
    const minutos = Number(r.match(/≈(\d+) min/)![1])
    expect(minutos).toBeGreaterThan(9)
    expect(minutos).toBeLessThan(20)
  })
})

describe('a duração de uma actividade', () => {
  test('lê-se em horas e minutos', () => {
    expect(duracaoLegivel(90)).toBe('1h30')
    expect(duracaoLegivel(120)).toBe('2h')
    expect(duracaoLegivel(45)).toBe('45min')
  })

  test('sem duração, não se mostra nada', () => {
    // Os roteiros gerados antes de pedirmos a duração não a têm.
    expect(duracaoLegivel(null)).toBe(null)
    expect(duracaoLegivel(undefined)).toBe(null)
    expect(duracaoLegivel(0)).toBe(null)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Uma cor por tipo, e uma só tabela
//
// Havia duas. O mapa tinha a sua própria lista, e nela o `food` era VERDE e o
// `leisure` LARANJA — exactamente ao contrário das etiquetas. Um restaurante
// aparecia com etiqueta laranja na lista e pino verde no mapa, a poucos
// centímetros no mesmo ecrã.
//
// Duas tabelas do mesmo mapeamento afastam-se sempre. Esta afastou-se de forma
// a trocar dois valores um pelo outro, que é o pior caso: nada parece partido,
// só se lê ao contrário.
describe('as cores dos tipos de actividade', () => {
  // Os valores de globals.css (.act-*), copiados à mão. Se a folha de estilos
  // mudar sem que isto mude, este teste é que dá o alarme.
  const NO_CSS: Record<string, string> = {
    visit:     '#60a5fa',
    food:      '#fb923c',
    transport: '#a1a1aa',
    leisure:   '#4ade80',
    hotel:     '#c084fc',
  }

  test('a tabela do código concorda com a folha de estilos', () => {
    expect(activityTypeColor).toEqual(NO_CSS)
  })

  test('o restaurante é laranja e o lazer é verde, não ao contrário', () => {
    // É o par que estava trocado, e é o que o utilizador viu.
    expect(activityTypeColor.food).toBe('#fb923c')
    expect(activityTypeColor.leisure).toBe('#4ade80')
    expect(activityTypeColor.food).not.toBe(activityTypeColor.leisure)
  })

  test('todos os tipos que existem têm cor', () => {
    // Um tipo novo no enum sem cor aqui sai cinzento no mapa e ninguém repara.
    for (const tipo of ['visit', 'food', 'transport', 'leisure', 'hotel']) {
      expect(activityTypeColor[tipo], tipo).toMatch(/^#[0-9a-f]{6}$/i)
    }
  })

  test('não há duas cores iguais', () => {
    const cores = Object.values(activityTypeColor)
    expect(new Set(cores).size).toBe(cores.length)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// O número tem de querer dizer o mesmo nos dois sítios
//
// O mapa numerava pelo índice na lista TODA, transportes incluídos. Via-se um
// pino "5" e não havia nada no ecrã com um 5 — e os números saltavam
// (1, 3, 5, 7) porque cada caminhada gastava um número sem ganhar um pino.
describe('a numeração das paragens', () => {
  const dia = (tipos: Activity['type'][]) =>
    tipos.map((type, i) => ({
      time: '10:00', name: `a${i}`, description: '', address: null,
      cost: null, currency: 'EUR', type, tips: null,
    })) as Activity[]

  test('conta só as paragens, sem saltos', () => {
    // Visita, caminhada, visita, caminhada, refeição → 1, —, 2, —, 3
    expect(numerarParagens(dia(['visit', 'transport', 'visit', 'transport', 'food'])))
      .toEqual([1, null, 2, null, 3])
  })

  test('o transporte não tem número porque não tem pino', () => {
    // Uma caminhada é o caminho entre dois sítios, não um sítio.
    const r = numerarParagens(dia(['transport', 'visit']))
    expect(r[0]).toBe(null)
    expect(r[1]).toBe(1)
  })

  test('um dia sem transportes numera-se de um a n', () => {
    expect(numerarParagens(dia(['visit', 'food', 'leisure']))).toEqual([1, 2, 3])
  })

  test('um dia só de transportes não numera nada', () => {
    expect(numerarParagens(dia(['transport', 'transport']))).toEqual([null, null])
  })

  test('uma actividade sem coordenadas conta na mesma', () => {
    // O número identifica a actividade na lista, não no mapa. Saltá-lo por não
    // ter pino desalinhava a numeração de tudo o que vem a seguir.
    const acts = dia(['visit', 'visit', 'visit'])
    acts[1].lat = null
    expect(numerarParagens(acts)).toEqual([1, 2, 3])
  })

  test('lista vazia não rebenta', () => {
    expect(numerarParagens([])).toEqual([])
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// O que se chama ao link do site
//
// A primeira versão chamava "Bilhetes no site oficial" a tudo o que tivesse
// custo — restaurantes incluídos. Não se compram bilhetes para um restaurante,
// e uma etiqueta errada faz duvidar de todas as outras.
describe('o nome do link do site', () => {
  const act = (type: Activity['type'], cost: number | null): Activity => ({
    time: '10:00', name: 'x', description: '', address: null,
    cost, currency: 'EUR', type, tips: null,
  })

  test('num museu pago, bilhetes', () => {
    expect(comoChamarAoSite(act('visit', 18))).toMatch(/Bilhetes/)
  })

  test('num restaurante, reserva — nunca bilhetes', () => {
    const r = comoChamarAoSite(act('food', 35))
    expect(r).toMatch(/Reservar/)
    expect(r).not.toMatch(/Bilhete/)
  })

  test('num sítio gratuito, é só o site', () => {
    const r = comoChamarAoSite(act('visit', 0))
    expect(r).not.toMatch(/Bilhete/)
    expect(r).toMatch(/Site oficial/)
  })

  test('sem custo preenchido não promete bilhetes', () => {
    // O modelo escreve `cost: null` com frequência. Prometer bilhete a partir
    // de um campo vazio é inventar.
    expect(comoChamarAoSite(act('visit', null))).not.toMatch(/Bilhete/)
  })
})

describe('a pesquisa, para quando não há site conhecido', () => {
  const act = (type: Activity['type'], cost: number | null, name = 'Castel SantAngelo'): Activity => ({
    time: '10:00', name, description: '', address: null,
    cost, currency: 'EUR', type, tips: null,
  })

  test('num sítio pago sem site, há por onde procurar', () => {
    // O Castel Sant'Angelo não tem etiqueta website no OSM — verificado. Sem
    // isto, quem quisesse o bilhete não tinha nada para clicar.
    const url = pesquisaDeBilhetes(act('visit', 15))
    expect(url).toContain('Castel')
    expect(url).toContain('bilhetes')
  })

  test('mas não numa praça gratuita', () => {
    // Seria ruído: não há bilhete que procurar.
    expect(pesquisaDeBilhetes(act('leisure', 0))).toBe(null)
    expect(pesquisaDeBilhetes(act('visit', null))).toBe(null)
  })

  test('nem num restaurante', () => {
    expect(pesquisaDeBilhetes(act('food', 35))).toBe(null)
  })

  test('usa o geoName quando existe, que é o nome que se procura', () => {
    const a = act('visit', 15)
    a.geoName = 'Castel SantAngelo Rome'
    expect(pesquisaDeBilhetes(a)).toContain('Rome')
  })
})

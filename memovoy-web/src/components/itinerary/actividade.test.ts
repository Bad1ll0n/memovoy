import { describe, test, expect } from 'vitest'
import { activityTypeColor, distanciaEntre, distanciaLegivel, duracaoLegivel, type Activity } from './actividade'

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

import { describe, test, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// Contraste dos tokens de cor, nos dois temas.
//
// O axe apanhou isto no browser — o botão de publicar do feed usava
// --text-muted sobre --surface2, 4,12:1 contra os 4,5 exigidos. Mas correr o
// axe precisa de dois servidores e de um browser, e a causa não era do botão:
// era do token. Um par de cores verifica-se com aritmética.
//
// O que tornava o defeito difícil de ver é que --text-muted passava sobre
// --bg-card (4,79) e só falhava sobre o fundo mais claro. Por isso este teste
// verifica cada cor de texto contra TODOS os fundos onde pode aparecer.

const css = readFileSync(join(__dirname, 'globals.css'), 'utf8')

/** Extrai o corpo de um bloco CSS a partir do seu selector. */
function bloco(selector: string): string {
  const i = css.indexOf(selector)
  if (i === -1) throw new Error(`selector ${selector} não encontrado em globals.css`)
  const abre = css.indexOf('{', i)
  const fecha = css.indexOf('}', abre)
  return css.slice(abre, fecha)
}

/** Lê os pares --nome: #hex de um bloco, ignorando o que esteja em comentários. */
function tokens(parte: string): Record<string, string> {
  const semComentarios = parte.replace(/\/\*[\s\S]*?\*\//g, '')
  const encontrados: Record<string, string> = {}
  for (const m of semComentarios.matchAll(/--([a-z0-9-]+):\s*(#[0-9A-Fa-f]{6})/g)) {
    encontrados[m[1]] = m[2]
  }
  return encontrados
}

// Separado pelo selector de cada tema, não por procurar um nome de token.
// A primeira versão dividia pela segunda ocorrência de '--bg-card' e o comentário
// que eu tinha acabado de escrever, que menciona esse token, partiu a divisão:
// os dois temas ficaram com valores trocados e o teste falhou por má leitura e
// não por má cor.
const ESCURO = tokens(bloco(':root {'))
const CLARO  = tokens(bloco('[data-theme="light"] {'))

/** Luminância relativa, como a WCAG a define. */
function luminancia(hex: string): number {
  const canais = [1, 3, 5]
    .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
  return 0.2126 * canais[0] + 0.7152 * canais[1] + 0.0722 * canais[2]
}

function contraste(a: string, b: string): number {
  const [claro, escuro] = [luminancia(a), luminancia(b)].sort((x, y) => y - x)
  return (claro + 0.05) / (escuro + 0.05)
}

// 4,5:1 é o mínimo da WCAG AA para texto normal.
const MINIMO = 4.5

const CORES_DE_TEXTO = ['text-primary', 'text-secondary', 'text-muted']
const FUNDOS         = ['bg-body', 'bg-card', 'surface2']

describe.each([['escuro', ESCURO], ['claro', CLARO]] as const)('tema %s', (nome, paleta) => {
  test('os tokens todos foram lidos', () => {
    for (const t of [...CORES_DE_TEXTO, ...FUNDOS]) {
      expect(paleta[t], `--${t} não foi encontrado no tema ${nome}`).toMatch(/^#[0-9A-Fa-f]{6}$/)
    }
  })

  test.each(CORES_DE_TEXTO)('--%s tem contraste suficiente em todos os fundos', (texto) => {
    const falhas = FUNDOS
      .map((fundo) => ({ fundo, r: contraste(paleta[texto], paleta[fundo]) }))
      .filter(({ r }) => r < MINIMO)
      .map(({ fundo, r }) => `${paleta[texto]} sobre --${fundo} ${paleta[fundo]}: ${r.toFixed(2)}:1`)

    expect(falhas, `--${texto} no tema ${nome}`).toEqual([])
  })
})

// O --danger aparece sempre sobre --danger-subtle, que é ele próprio
// translúcido: o .btn-danger, a pastilha LIVE e os avisos usam esse par. Um
// fundo com alfa não se compara directamente — tem de ser composto sobre o que
// está por baixo primeiro. Foi esta combinação que escapou à primeira versão
// deste teste e que o axe encontrou no browser.
function compor(rgba: string, fundoHex: string): string {
  const m = rgba.match(/rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)[,\s/]+([\d.]+)/)
  if (!m) throw new Error(`não consigo ler ${rgba}`)
  const [r, g, b, a] = m.slice(1).map(Number)
  const base = [1, 3, 5].map((i) => parseInt(fundoHex.slice(i, i + 2), 16))
  const canais = [r, g, b].map((v, i) => Math.round(a * v + (1 - a) * base[i]))
  return '#' + canais.map((v) => v.toString(16).padStart(2, '0')).join('')
}

/** Lê um token com valor rgba(), que o regex dos hex não apanha. */
function tokenRgba(selector: string, nome: string): string {
  const m = bloco(selector).match(new RegExp(`--${nome}:\\s*(rgba?\\([^)]+\\))`))
  if (!m) throw new Error(`--${nome} não encontrado em ${selector}`)
  return m[1]
}

describe.each([
  ['escuro', ':root {', ESCURO],
  ['claro', '[data-theme="light"] {', CLARO],
] as const)('cores de estado no tema %s', (nome, selector, paleta) => {
  // Cada uma destas aparece sobre a sua própria versão translúcida: o
  // .btn-danger e a pastilha LIVE num caso, o banner de sucesso no outro.
  test.each(['danger', 'success'] as const)('--%s legível sobre a sua versão subtil', (cor) => {
    const fundo = compor(tokenRgba(selector, `${cor}-subtle`), paleta['bg-card'])
    const r = contraste(paleta[cor], fundo)

    expect(r, `--${cor} ${paleta[cor]} sobre ${fundo} no tema ${nome}: ${r.toFixed(2)}:1`)
      .toBeGreaterThanOrEqual(MINIMO)
  })
})

describe('o cálculo em si', () => {
  // Sem isto, um erro na fórmula fazia o teste passar sempre e não protegia nada.
  test('preto sobre branco é 21:1', () => {
    expect(contraste('#000000', '#FFFFFF')).toBeCloseTo(21, 1)
  })

  test('uma cor contra si própria é 1:1', () => {
    expect(contraste('#7D9CB6', '#7D9CB6')).toBeCloseTo(1, 5)
  })

  test('a composição de um fundo translúcido bate certo', () => {
    // 15% de vermelho sobre preto tem de dar exactamente 15% de vermelho.
    expect(compor('rgba(255, 0, 0, 0.15)', '#000000')).toBe('#260000')
    // Alfa 1 devolve a própria cor.
    expect(compor('rgba(18, 52, 86, 1)', '#ffffff')).toBe('#123456')
  })

  test('a cor que o axe reprovou continua a reprovar aqui', () => {
    // #7090AA sobre --surface2 do tema escuro: era este o valor real.
    expect(contraste('#7090AA', '#1B2E44')).toBeLessThan(MINIMO)
  })
})

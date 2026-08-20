import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

// A marca deixou de ser laranja há muito, e o laranja sobreviveu em 34 sítios.
//
// Não foi distracção de ninguém. Havia tokens --danger-subtle, --success-subtle,
// --info-subtle, --warning-subtle e --violet-subtle — e nenhum para o acento,
// que é o mais usado dos seis. Sem sítio onde o pôr, cada fundo e cada contorno
// de acento foi escrito à mão em rgba(252,163,17,…), e quando a cor da marca
// mudou ficaram todos para trás. Os emails de verificação e de recuperação de
// password, que são a única cara da marca fora da app, continuaram a mandar um
// Memovoy laranja durante todo esse tempo.
//
// Nada apanhou isto: não é erro de compilação, não é teste vermelho, não é aviso
// nenhum. É só a cor errada, e só se vê a olho. Daí esta varredura.

/** import.meta.dirname é src/app, logo isto é src/. */
const SRC = join(import.meta.dirname, '..')

/** As três únicas ocorrências legítimas: cores de CATEGORIA, onde o laranja é
 *  um tom entre vários e não a marca. Uma paleta de categorias pode ter
 *  laranja; o cromo da aplicação não. */
const CATEGORIAS_PERMITIDAS = [
  'components/itinerary/ExpensesPanel.tsx',      // despesas de lazer
  'components/map/ActivityMap.tsx',              // actividade de lazer
  'app/(app)/itineraries/[id]/share/page.tsx',   // refeições
]

function ficheirosDeCodigo(dir: string, acc: string[] = []): string[] {
  for (const nome of readdirSync(dir)) {
    const caminho = join(dir, nome)
    if (statSync(caminho).isDirectory()) ficheirosDeCodigo(caminho, acc)
    // Os testes ficam de fora: este próprio ficheiro tem a cor antiga escrita
    // na expressão que a procura, e apanhava-se a si mesmo.
    else if (/\.(tsx?|css)$/.test(nome) && !/\.test\.tsx?$/.test(nome)) acc.push(caminho)
  }
  return acc
}

const LARANJA_ANTIGO = /#fca311|rgba\(\s*252\s*,\s*163\s*,\s*17\s*,/i

describe('a paleta antiga não volta a entrar', () => {
  it('só as cores de categoria podem usar o laranja antigo', () => {
    const infractores: string[] = []

    for (const caminho of ficheirosDeCodigo(SRC)) {
      const relativo = caminho.slice(SRC.length + 1).replace(/\\/g, '/')
      if (CATEGORIAS_PERMITIDAS.some((p) => relativo === p)) continue

      readFileSync(caminho, 'utf8').split('\n').forEach((linha, i) => {
        // Comentários que falam da cor antiga são história, não uso.
        const comentario = /^\s*(\/\/|\*|\/\*)/.test(linha)
        if (LARANJA_ANTIGO.test(linha) && !comentario) {
          infractores.push(`${relativo}:${i + 1}`)
        }
      })
    }

    expect(infractores, 'o laranja da paleta antiga voltou ao código').toEqual([])
  })

  it('o acento tem tokens de tinto, como as outras cores de estado', () => {
    // A causa raiz. Enquanto não houver onde pôr um fundo de acento, alguém
    // volta a escrevê-lo à mão — e volta a ficar para trás na próxima mudança.
    const css = readFileSync(join(SRC, 'app/globals.css'), 'utf8')

    for (const token of ['--accent-faint', '--accent-subtle', '--accent-border']) {
      const ocorrencias = css.split('\n').filter((l) => l.trim().startsWith(`${token}:`))
      expect(ocorrencias.length, `${token} tem de existir nos dois temas`).toBe(2)
    }
  })
})

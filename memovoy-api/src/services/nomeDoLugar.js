/**
 * O sítio que o Nominatim devolveu é mesmo o que pedimos?
 *
 * Procurar "St. Peter's Basilica, Roma, Itália" devolve a Basílica de San
 * Pietro in Vincoli — outra igreja, a 1,5 km, com horário de abertura próprio.
 * A verificação de distância que já existe não apanha isto: 1,5 km está muito
 * dentro dos 150 km que servem para excluir outro continente.
 *
 * Para um pino no mapa, 1,5 km é um erro que se vê e se perdoa. Para um horário
 * de abertura não é: passaríamos a dizer a alguém que a Basílica de São Pedro
 * fecha às 12:30 porque é a essa hora que fecha uma igreja diferente. Um horário
 * errado é pior do que nenhum — quem o lê não tem como saber que está errado.
 *
 * O Nominatim traz `namedetails=1` de graça, no mesmo pedido, com todos os
 * nomes do sítio em todas as línguas. Comparar o que pedimos com esses nomes
 * separa os casos com clareza:
 *
 *     "Capitoline Museums"    → name:en "Capitoline Museums"    coincide
 *     "Colosseum"             → name:en "Colosseum"             coincide
 *     "St. Peter's Basilica"  → name:en "Saint Peter in Chains"  NÃO coincide
 */

/** Sem acentos, sem pontuação, sem maiúsculas, sem espaços a mais. */
export function normalizar(texto) {
  return String(texto ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/['’`]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

/**
 * Palavras que não distinguem um sítio de outro.
 *
 * "Basilica di San Pietro" e "Basilica di San Pietro in Vincoli" partilham tudo
 * menos "vincoli" — é a palavra rara que decide, não as comuns. Sem tirar as
 * comuns, a semelhança entre os dois sobe o suficiente para passar.
 *
 * Inclui as partículas das línguas em que os nomes vêm, e os verbos que o
 * modelo põe à frente ("Almoço no...", "Visita ao...").
 */
const VAZIAS = new Set([
  'the', 'of', 'and', 'a', 'o', 'as', 'os', 'da', 'de', 'do', 'das', 'dos',
  'di', 'del', 'della', 'dei', 'degli', 'la', 'le', 'il', 'lo', 'l', 'e',
  'el', 'los', 'las', 'y', 'des', 'du', 'et', 'in', 'al', 'à', 'ao', 'na', 'no',
  'visita', 'passeio', 'almoco', 'jantar', 'visit', 'lunch', 'dinner',
])

function palavras(texto) {
  return normalizar(texto).split(' ').filter((p) => p && !VAZIAS.has(p))
}

/**
 * Quanto é que dois nomes se parecem, de 0 a 1.
 *
 * Divide pelo nome MAIS LONGO, e isso é a parte que interessa.
 *
 * A primeira versão dividia pelo mais curto, para que "Colosseum" contra
 * "Colosseo di Roma" contasse como igual. Um teste que escrevi apanhou o preço
 * disso: assim, um subconjunto é sempre uma correspondência perfeita, e
 *
 *     "Basilica di San Pietro"  vs  "Basilica di San Pietro in Vincoli"  =  1
 *
 * — exactamente o erro que este ficheiro existe para impedir. A palavra que
 * distingue as duas igrejas é a que sobra, e dividir pelo mais curto era
 * ignorá-la por construção.
 *
 * A dividir pelo mais longo dá 0,75 e é recusado. Os casos legítimos não sofrem
 * porque o Nominatim traz o nome em várias línguas: "Colosseum" encontra o
 * `name:en` exacto, não precisa de se parecer com a versão longa.
 */
export function semelhanca(a, b) {
  const pa = palavras(a)
  const pb = palavras(b)
  if (pa.length === 0 || pb.length === 0) return 0

  const conjuntoB = new Set(pb)
  const comuns = pa.filter((p) => conjuntoB.has(p)).length
  return comuns / Math.max(pa.length, pb.length)
}

/**
 * A partir de onde se aceita.
 *
 * 0,8 e não 1: os nomes do OSM trazem variações legítimas ("Musei Capitolini"
 * contra "Museus Capitolinos") e exigir identidade perdia matches bons. Medido
 * nos casos reais, o errado — São Pedro contra São Pedro in Vincoli — fica bem
 * abaixo, porque "vincoli" não existe do nosso lado.
 */
export const LIMIAR = 0.8

/**
 * O resultado corresponde ao que se procurou?
 *
 * @param {string} procurado   o termo que enviámos
 * @param {object} resultado   a resposta do Nominatim (display_name, namedetails)
 * @returns {{coincide: boolean, melhor: number, nomeQueBateu: string|null}}
 */
export function correspondeAoPedido(procurado, resultado) {
  const nomes = []

  // Todos os nomes que o sítio tem, em qualquer língua. É o que faz "Colosseum"
  // encontrar um sítio cujo nome principal é "Colosseo".
  const nd = resultado?.namedetails ?? {}
  for (const [chave, valor] of Object.entries(nd)) {
    if (/^(name|alt_name|official_name|int_name|short_name)/.test(chave) && valor) {
      nomes.push(valor)
    }
  }

  // O display_name traz a morada atrás, mas a primeira parte é o nome. Serve de
  // rede quando o sítio não tem namedetails.
  const display = resultado?.display_name
  if (display) nomes.push(String(display).split(',')[0])

  if (nomes.length === 0) return { coincide: false, melhor: 0, nomeQueBateu: null }

  let melhor = 0
  let nomeQueBateu = null
  for (const nome of nomes) {
    const s = semelhanca(procurado, nome)
    if (s > melhor) { melhor = s; nomeQueBateu = nome }
  }

  return { coincide: melhor >= LIMIAR, melhor, nomeQueBateu }
}

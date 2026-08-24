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

/**
 * A mesma palavra escrita de outra maneira.
 *
 * "St. Peter's Basilica" contra "Saint Peter's Basilica" dava 0,67 e era
 * recusado — o mesmo sítio, travado por uma abreviatura. E é o caso mais
 * frequente que há: metade dos monumentos da Europa é um santo qualquer, e o
 * OSM escreve o honorífico na língua local enquanto o modelo escreve noutra.
 *
 * Só se juntam variantes do MESMO termo. Traduzir "Peter" para "Pietro" seria
 * outra coisa: aí passariam a coincidir sítios que são mesmo diferentes, e é
 * precisamente São Pedro contra San Pietro in Vincoli que isto tem de separar.
 */
const IGUAIS = new Map(Object.entries({
  st: 'santo', saint: 'santo', san: 'santo', sant: 'santo', santo: 'santo',
  santa: 'santo', sao: 'santo', s: 'santo', ss: 'santo', sankt: 'santo',
  mt: 'monte', mount: 'monte', monte: 'monte',
  pza: 'praca', piazza: 'praca', plaza: 'praca', praca: 'praca', place: 'praca',
  museu: 'museu', museo: 'museu', museum: 'museu', musee: 'museu', musei: 'museu',
  museus: 'museu', museums: 'museu', musei_: 'museu',
  basilica: 'basilica', basilique: 'basilica',
  catedral: 'catedral', cattedrale: 'catedral', cathedral: 'catedral', duomo: 'catedral',
  galeria: 'galeria', galleria: 'galeria', gallery: 'galeria', galerie: 'galeria',
}))

function palavras(texto) {
  return normalizar(texto)
    .split(' ')
    .filter((p) => p && !VAZIAS.has(p))
    .map((p) => IGUAIS.get(p) ?? p)
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
 * O nome do sítio, sem o que o modelo lhe põe à frente.
 *
 * O modelo escreve "Almoço – Ristorante Il Falchetto" e "Visita ao Coliseu".
 * Comparar nomes já ignorava esses prefixos, mas a PROCURA levava-os na mesma —
 * e o Nominatim procura pelo texto inteiro. O Il Falchetto tem horário no OSM e
 * nós não o encontrávamos por causa da palavra "Almoço".
 *
 * Corta só o prefixo, e só até ao separador. "Jantar no Ristorante X" fica
 * "Ristorante X"; um nome que por acaso comece por uma destas palavras sem
 * separador nenhum fica intacto.
 */
/** O que o modelo põe à frente: o que se faz, e como. Nunca o sítio. */
const PALAVRAS_DE_ACTIVIDADE = new Set([
  'almoco', 'jantar', 'lanche', 'ceia', 'brunch', 'cafe', 'gelato',
  'pequeno almoco', 'pequeno-almoco', 'pequeno',
  'visita', 'passeio', 'caminhada', 'exploracao', 'chegada', 'partida',
  'descoberta', 'entrada', 'subida', 'travessia', 'regresso', 'retorno',
  'lunch', 'dinner', 'breakfast', 'visit', 'walk', 'stroll', 'tour',
  // Como se faz — adjectivos que aparecem entre o verbo e o sítio.
  'guiada', 'guiado', 'noturno', 'nocturna', 'nocturno', 'noturna',
  'matinal', 'livre', 'relaxante', 'romantico', 'romantica', 'tipico',
  'tipica', 'panoramica', 'panoramico', 'rapida', 'rapido', 'privado',
  'privada', 'opcional', 'tradicional',
])

/** Ligações. Consumir uma é o sinal de que o que vem a seguir é o sítio. */
const LIGACOES = new Set([
  'ao', 'a', 'à', 'aos', 'as', 'às', 'no', 'na', 'nos', 'nas', 'em',
  'de', 'do', 'da', 'dos', 'das', 'pelo', 'pela', 'pelos', 'pelas',
  'ate', 'longo', 'para', 'por', 'com', 'to', 'at', 'the', 'of', 'in', 'along',
])

/**
 * O nome do sítio, sem o que o modelo lhe põe à frente.
 *
 * O modelo escreve "Almoço – Ristorante Il Falchetto" e "Visita ao Coliseu".
 * Comparar nomes já ignorava esses prefixos, mas a PROCURA levava-os na mesma —
 * e o Nominatim procura pelo texto inteiro. O Il Falchetto tem horário no OSM e
 * nós não o encontrávamos por causa da palavra "Almoço".
 *
 * A primeira versão era um regex que exigia o verbo COLADO à preposição, e
 * partia-se em quase tudo o que não fosse o caso simples:
 *
 *     "Passeio ao longo do Rio Tibre"    → "longo do Rio Tibre"   (pior ainda)
 *     "Passeio noturno pelo Trastevere"  → inalterado
 *     "Visita guiada ao Coliseu"         → inalterado
 *
 * Agora corta palavra a palavra, enquanto forem palavras de actividade ou
 * ligações, e pára na primeira que não seja.
 *
 * ── A salvaguarda ───────────────────────────────────────────────────────────
 *
 * Só corta se tiver consumido pelo menos uma LIGAÇÃO. É isso que separa
 * "Passeio pela Via Appia" (corta: há um "pela") de "Passeio Público" — que é
 * um jardim a sério em Lisboa, e onde cortar deixaria "Público".
 */
export function limparTermo(termo) {
  if (typeof termo !== 'string' || termo.trim() === '') return ''

  const limpo = termo.trim()

  // "Almoço – Ristorante Il Falchetto". O travessão é tão sinal como uma
  // preposição: o que vem antes dele é o que se faz, o que vem depois é o
  // sítio. Só conta se o que fica à esquerda for TODO palavras de actividade —
  // senão "Santa Maria — Trastevere" perderia metade do nome.
  //
  // O hífen só conta rodeado de espaços. "Jantar - Da Enzo" é um separador;
  // o de "Aix-en-Provence" ou "Pequeno-almoço" faz parte da palavra, e partir
  // ali deixaria metade de um nome.
  const comSeparador = /^(.+?)\s*(?:[–—:]|\s-\s)\s*(.+)$/.exec(limpo)
  if (comSeparador) {
    const esquerda = comSeparador[1].trim().split(/\s+/).map(normalizar)
    const soActividade = esquerda.every((p) => PALAVRAS_DE_ACTIVIDADE.has(p) || LIGACOES.has(p))
    if (soActividade && comSeparador[2].trim()) return comSeparador[2].trim()
  }

  const palavras = limpo.split(/\s+/).filter(Boolean)
  let i = 0
  let ligacaoConsumida = false

  while (i < palavras.length) {
    const p = normalizar(palavras[i])
    if (LIGACOES.has(p)) { ligacaoConsumida = true; i++; continue }
    // Depois da ligação vem o NOME, e uma palavra de actividade que apareça
    // aí já faz parte dele. "Pequeno-almoço no Café Vianna" tem duas palavras
    // de comida: a primeira é o que se faz, a segunda é o sítio. Continuar a
    // cortar deixava "Vianna" — e o Café Vianna chama-se Café Vianna.
    if (!ligacaoConsumida && PALAVRAS_DE_ACTIVIDADE.has(p)) { i++; continue }
    break
  }

  const resto = palavras.slice(i).join(' ').trim()
  if (!ligacaoConsumida || resto === '') return limpo
  return resto
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

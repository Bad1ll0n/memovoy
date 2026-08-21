/**
 * O que está configurado, e o que só parece estar.
 *
 * Três vezes no mesmo dia o mesmo defeito mordeu, sempre pela mesma razão:
 *
 *   - SMTP_USER e SMTP_PASS tinham valores de exemplo. Como não estavam
 *     vazios, a app construía o transporter, o Gmail recusava, e o `.catch`
 *     de quem chamava engolia tudo. Registar uma conta não deixava rasto
 *     nenhum — nem email, nem link, nem erro.
 *
 *   - GROQ_API_KEY era `gsk_` com sete caracteres. Uma chave real tem à volta
 *     de 56. A app arrancava calada e a falha só aparecia quando alguém tentava
 *     gerar um roteiro, na forma de um 401 do fornecedor a chegar ao browser.
 *
 *   - No CSS, `var(--amber)` referia um token que nunca existiu, e o fallback
 *     escondeu-o durante meses.
 *
 * A forma do erro é sempre a mesma: confiar em «a variável existe» quando o que
 * interessa é «a variável serve». Uma verificação de presença dá verde nos três
 * casos.
 *
 * Por isso esta verificação olha para a FORMA do valor, não só para a
 * existência, e corre uma vez no arranque — não na primeira utilização, que é
 * tarde de mais e no sítio errado.
 *
 * O que é obrigatório continua a rebentar (a app não faz nada sem base de dados
 * nem sem segredos de JWT). O resto avisa e deixa arrancar: sem IA ou sem email
 * ficam trinta e tal páginas a funcionar, e recusar arrancar por causa disso
 * seria pior do que o problema.
 */

/**
 * Palavras que aparecem em valores de exemplo.
 *
 * Tirei daqui o 'xxx' e o 'todo': são curtos de mais e aparecem por acaso
 * dentro de valores legítimos. Uma chave aleatória de 52 caracteres tem uma
 * hipótese em poucos milhares de conter 'xxx', e acusá-la mandava quem a
 * configurou procurar um problema que não existe. Um falso positivo numa
 * verificação de arranque é pior do que um falso negativo: ensina a ignorar
 * o aviso.
 */
const MARCADORES = [
  'example', 'exemplo', 'your-', 'o-teu', 'a-tua', 'changeme', 'placeholder',
  'insira', 'preencher', 'coloca-aqui',
]

function pareceMarcador(valor) {
  const v = valor.toLowerCase()
  return MARCADORES.some((m) => v.includes(m))
}

/**
 * @typedef {Object} Verificacao
 * @property {string}  nome        variável de ambiente
 * @property {string}  paraQue     funcionalidade que depende dela
 * @property {boolean} obrigatoria
 * @property {number}  [minimo]    comprimento mínimo plausível
 * @property {string}  [prefixo]   prefixo que uma chave real tem sempre
 */

/** @type {Verificacao[]} */
export const VERIFICACOES = [
  { nome: 'DATABASE_URL',       paraQue: 'base de dados',      obrigatoria: true,  minimo: 20 },
  { nome: 'JWT_SECRET',         paraQue: 'autenticação',       obrigatoria: true,  minimo: 16 },
  { nome: 'JWT_REFRESH_SECRET', paraQue: 'autenticação',       obrigatoria: true,  minimo: 16 },

  { nome: 'GROQ_API_KEY', paraQue: 'geração com IA', obrigatoria: false, minimo: 40, prefixo: 'gsk_' },
  { nome: 'SMTP_HOST',    paraQue: 'envio de email', obrigatoria: false, minimo: 4 },
  { nome: 'SMTP_USER',    paraQue: 'envio de email', obrigatoria: false, minimo: 3 },
  { nome: 'SMTP_PASS',    paraQue: 'envio de email', obrigatoria: false, minimo: 8 },
]

/**
 * Avalia uma variável. Devolve 'ok', 'em falta' ou uma razão para desconfiar.
 * @returns {{ estado: 'ok'|'ausente'|'suspeita', razao?: string }}
 */
export function avaliar({ nome, minimo, prefixo }, valor) {
  if (!valor) return { estado: 'ausente' }

  // Primeiro o que é objectivo — prefixo e comprimento —, e só depois a
  // heurística das palavras. Ao contrário, uma chave com o tamanho certo mas
  // com o prefixo errado era acusada de "parecer um exemplo", que manda quem
  // lê procurar no sítio errado.
  if (prefixo && !valor.startsWith(prefixo)) {
    return { estado: 'suspeita', razao: `devia começar por "${prefixo}"` }
  }
  if (minimo && valor.length < minimo) {
    return { estado: 'suspeita', razao: `tem ${valor.length} caracteres, esperavam-se pelo menos ${minimo}` }
  }
  if (pareceMarcador(valor)) {
    return { estado: 'suspeita', razao: 'parece um valor de exemplo' }
  }
  return { estado: 'ok' }
}

/**
 * Corre todas as verificações contra um ambiente.
 *
 * Recebe o ambiente em vez de ler process.env directamente, para ser testável
 * sem mexer no processo.
 *
 * @param {Record<string, string|undefined>} [ambiente]
 * @returns {{ nome: string, paraQue: string, obrigatoria: boolean, estado: string, razao?: string }[]}
 */
export function verificarConfiguracao(ambiente = process.env) {
  return VERIFICACOES.map((v) => ({
    nome: v.nome,
    paraQue: v.paraQue,
    obrigatoria: v.obrigatoria,
    ...avaliar(v, (ambiente[v.nome] ?? '').trim()),
  }))
}

/**
 * Escreve o resultado no arranque e rebenta se faltar algo obrigatório.
 *
 * Só imprime o que está mal. Um bloco com quinze linhas verdes em cada arranque
 * ensina a saltar o bloco todo, e a linha que interessa passa despercebida no
 * meio delas.
 */
export function relatarConfiguracao(ambiente = process.env, registo = console) {
  const r = verificarConfiguracao(ambiente)

  const emFaltaObrigatorias = r.filter((x) => x.obrigatoria && x.estado !== 'ok')
  if (emFaltaObrigatorias.length > 0) {
    const detalhe = emFaltaObrigatorias
      .map((x) => `${x.nome} (${x.razao ?? 'em falta'})`)
      .join(', ')
    throw new Error(`Configuração obrigatória inválida: ${detalhe}`)
  }

  const problemas = r.filter((x) => x.estado !== 'ok')
  if (problemas.length === 0) return r

  registo.warn('[config] funcionalidades que não vão funcionar com este .env:')
  const porFuncionalidade = new Map()
  for (const p of problemas) {
    if (!porFuncionalidade.has(p.paraQue)) porFuncionalidade.set(p.paraQue, [])
    porFuncionalidade.get(p.paraQue).push(
      p.estado === 'ausente' ? `${p.nome} em falta` : `${p.nome}: ${p.razao}`,
    )
  }
  for (const [funcionalidade, motivos] of porFuncionalidade) {
    registo.warn(`[config]   ${funcionalidade} — ${motivos.join('; ')}`)
  }

  return r
}

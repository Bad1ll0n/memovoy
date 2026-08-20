/**
 * Quem pode ver o conteúdo de quem.
 *
 * O interruptor "conta privada" existia nas definições, era gravado, era
 * devolvido pela API — e não filtrava nada. A verificação estava escrita à mão
 * numa única rota (as marcações de /users/:id/bookmarks) e nunca foi aplicada
 * aos outros seis caminhos de leitura. Resultado: as publicações de uma conta
 * privada saíam no /explore, no /search, no /posts/:id e no perfil, sem sequer
 * ser preciso estar autenticado.
 *
 * Por isso a regra vive aqui e não em cada consulta. Uma regra de autorização
 * repetida à mão é uma regra que mais cedo ou mais tarde falta num sítio, e
 * quando falta não há erro nenhum — só conteúdo a mais.
 *
 * A regra: o conteúdo de um autor é visível se a conta é pública, se quem está
 * a ver é o próprio autor, ou se já o segue. Um observador anónimo entra aqui
 * com NULL e só passa a primeira condição, que é o que se quer.
 *
 * Nota sobre o alcance disto: seguir alguém é imediato e não precisa de
 * aprovação (POST /users/:id/follow insere logo em follows, mesmo que a conta
 * seja privada). Portanto isto fecha a porta a estranhos e a motores de busca,
 * mas não a quem carregue em "Seguir". Fechá-la a sério exige uma fila de
 * pedidos de seguimento, que é outro trabalho.
 */

import { query } from './pool.js'

const ALIAS_VALIDO = /^[a-z_][a-z0-9_]*$/i
const PARAM_VALIDO = /^\$\d+$/

/** Os argumentos são constantes escritas por nós, nunca entrada do utilizador.
 *  A validação existe para que continue a ser verdade se alguém um dia lhes
 *  passar uma variável sem pensar duas vezes. */
function validar(alias, param) {
  if (!ALIAS_VALIDO.test(alias)) throw new Error(`alias de tabela inválido: ${alias}`)
  if (!PARAM_VALIDO.test(param)) throw new Error(`marcador de parâmetro inválido: ${param}`)
}

/**
 * Para consultas que já têm a tabela `users` em JOIN.
 *
 * @param {string} alias  alias da tabela users na consulta (por norma 'u')
 * @param {string} param  marcador do id de quem está a ver ('$1', '$3', ...),
 *                        que pode trazer NULL para visitantes anónimos
 */
export function autorVisivel(alias, param) {
  validar(alias, param)
  return `(
         ${alias}.is_private = FALSE
      OR ${alias}.id = ${param}::uuid
      OR EXISTS (SELECT 1 FROM follows
                  WHERE follower_id = ${param}::uuid
                    AND following_id = ${alias}.id)
    )`
}

/**
 * Para consultas que não trazem a tabela `users`. Recebe a coluna que guarda
 * o id do autor (por exemplo 'p.user_id') e vai buscá-lo por EXISTS.
 */
export function autorVisivelPorId(colunaAutor, param) {
  validar(colunaAutor.replace('.', '_'), param)
  return `EXISTS (
      SELECT 1 FROM users autor
       WHERE autor.id = ${colunaAutor}
         AND ${autorVisivel('autor', param)}
    )`
}

/**
 * A mesma regra, mas em JavaScript, para as rotas que respondem 403 antes de
 * chegarem a consultar o conteúdo — o perfil precisa de dizer "conta privada"
 * em vez de devolver uma lista vazia, que seria indistinguível de alguém que
 * ainda não publicou nada.
 *
 * Devolve false se o autor não existir; quem chama trata o 404 primeiro.
 */
export async function autorVisivelPara(autorId, observadorId) {
  const { rows } = await query(
    `SELECT 1 FROM users u WHERE u.id = $1 AND ${autorVisivel('u', '$2')}`,
    [autorId, observadorId],
  )
  return rows.length > 0
}

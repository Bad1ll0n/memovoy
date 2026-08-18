import { buildApp } from '../../src/app.js'
import { pool, query } from '../../src/db/pool.js'

/**
 * Instância da app partilhada por todos os testes de um ficheiro.
 * Rate limiting desligado: o registo permite 5 pedidos por minuto e os testes
 * criam vários utilizadores seguidos.
 */
export async function criarApp() {
  const { app } = await buildApp({ rateLimit: false })
  await app.ready()
  return app
}

/** Fecha a app e a pool. Chamar no fim de cada ficheiro de teste. */
export async function fecharApp(app) {
  await app.close()
  await pool.end()
}

/**
 * Esvazia as tabelas entre casos.
 *
 * DELETE e não TRUNCATE de propósito: o hook onRequest do last_seen dispara um
 * `UPDATE users` sem esperar por ele (fire-and-forget com .catch()), e esse
 * update fica em voo depois da resposta. O TRUNCATE pede ACCESS EXCLUSIVE e
 * entra em deadlock com ele; o DELETE tranca linhas e limita-se a esperar.
 *
 * As chaves estrangeiras para users(id) têm ON DELETE CASCADE, por isso apagar
 * os utilizadores arrasta quase tudo. Duas tabelas não vêm atrás:
 *
 * - `conversations` não tem coluna user_id — só `conversation_participants` a
 *   tem. Apagar utilizadores deixa a conversa lá, vazia. (Vale o mesmo em
 *   produção: cada conta eliminada deixa uma linha órfã.)
 * - `audit_logs` sobrevive de propósito — é um registo de auditoria.
 */
export async function limparBaseDeDados() {
  await query('DELETE FROM users')
  await query('DELETE FROM conversations')
  await query('DELETE FROM audit_logs')
}

/** Corpo válido de registo, com sufixo único para não colidir. */
export function dadosDeRegisto(sufixo = Math.random().toString(36).slice(2, 8)) {
  return {
    username: `utilizador${sufixo}`.toLowerCase().replace(/[^a-z0-9_]/g, ''),
    email:    `${sufixo}@exemplo.pt`,
    password: 'PasswordValida1',
  }
}

/**
 * Regista um utilizador e devolve o corpo da resposta mais os dados usados.
 * Falha ruidosamente se o registo não devolver 2xx — um teste que depende
 * disto não deve continuar em silêncio.
 */
export async function registarUtilizador(app, dados = dadosDeRegisto()) {
  const res = await app.inject({
    method:  'POST',
    url:     '/auth/register',
    payload: dados,
  })

  if (res.statusCode >= 300) {
    throw new Error(`registo falhou (${res.statusCode}): ${res.body}`)
  }

  return { ...JSON.parse(res.body), dados }
}

/** Cabeçalho de autorização a partir de um access token. */
export function comToken(accessToken) {
  return { authorization: `Bearer ${accessToken}` }
}

/**
 * Cria um post e devolve-o. Falha ruidosamente se a criação não correr bem —
 * um teste que dependa disto não deve seguir em silêncio.
 */
export async function criarPost(app, accessToken, corpo = { caption: 'Um post.' }) {
  const res = await app.inject({
    method:  'POST',
    url:     '/posts',
    headers: comToken(accessToken),
    payload: corpo,
  })

  if (res.statusCode >= 300) {
    throw new Error(`criação de post falhou (${res.statusCode}): ${res.body}`)
  }

  return JSON.parse(res.body)
}

import { query } from '../db/pool.js'

/**
 * Regista uma entrada de auditoria. Nunca lanca.
 *
 * Devolve a promessa para quem precisar de esperar por ela. A maioria dos
 * chamadores dispara e segue — e bem, e escrituracao. Mas na eliminacao de
 * conta e preciso esperar: audit_logs.user_id tem ON DELETE SET NULL, e se o
 * DELETE do utilizador ganhar a corrida o INSERT falha por chave estrangeira e
 * o registo perde-se, silenciado por este .catch.
 * @param {string|null} userId
 * @param {string} action  e.g. 'password_change', 'account_delete', 'email_change'
 * @param {object} details  arbitrary JSON context
 * @param {string|null} ip
 */
export function logAudit(userId, action, details = {}, ip = null) {
  return query(
    'INSERT INTO audit_logs (user_id, action, details, ip) VALUES ($1, $2, $3, $4)',
    [userId ?? null, action, JSON.stringify(details), ip],
  ).catch((err) => console.error('[audit] write failed:', err.message))
}

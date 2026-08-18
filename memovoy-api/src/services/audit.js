import { query } from '../db/pool.js'

/**
 * Writes an audit log entry. Never throws.
 *
 * Returns the promise for callers that need to await it. Most fire and forget —
 * rightly so, it is bookkeeping. But account deletion must await it:
 * audit_logs.user_id is ON DELETE SET NULL, so if the user DELETE wins the race
 * the INSERT fails on the foreign key and the record is lost, silenced by the
 * .catch below.
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

import { query } from '../db/pool.js'

/**
 * Fire-and-forget audit log entry. Never throws.
 * @param {string|null} userId
 * @param {string} action  e.g. 'password_change', 'account_delete', 'email_change'
 * @param {object} details  arbitrary JSON context
 * @param {string|null} ip
 */
export function logAudit(userId, action, details = {}, ip = null) {
  query(
    'INSERT INTO audit_logs (user_id, action, details, ip) VALUES ($1, $2, $3, $4)',
    [userId ?? null, action, JSON.stringify(details), ip],
  ).catch((err) => console.error('[audit] write failed:', err.message))
}

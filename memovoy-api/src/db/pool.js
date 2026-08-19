import pg from 'pg'

const { Pool } = pg

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL environment variable is required')
}

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 20,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
})

pool.on('error', (err) => {
  console.error('[db] Unexpected pool error', err)
})

/**
 * @param {string} text
 * @param {unknown[]} [params]
 */
export async function query(text, params) {
  const start = Date.now()
  try {
    const result = await pool.query(text, params)
    const duration = Date.now() - start
    // Desligável: durante um teste de carga são milhares de linhas por segundo,
    // e o próprio registo passa a pesar no que se está a medir.
    if (duration > 100 && process.env.LOG_SLOW_QUERIES !== 'false') {
      console.warn('[db] Slow query', { text: text.slice(0, 80), duration })
    }
    return result
  } catch (err) {
    console.error('[db] Query error', { text: text.slice(0, 80), error: err.message })
    throw err
  }
}

export async function transaction(fn) {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const result = await fn(client)
    await client.query('COMMIT')
    return result
  } catch (err) {
    await client.query('ROLLBACK')
    throw err
  } finally {
    client.release()
  }
}

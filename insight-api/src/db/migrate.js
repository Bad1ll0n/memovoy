import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { pool } from './pool.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const migrationsDir = join(__dirname, '../../migrations')

async function migrate() {
  const client = await pool.connect()

  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS _migrations (
        id         SERIAL PRIMARY KEY,
        filename   TEXT NOT NULL UNIQUE,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `)

    const { rows: applied } = await client.query('SELECT filename FROM _migrations ORDER BY id')
    const appliedSet = new Set(applied.map((r) => r.filename))

    const { readdirSync } = await import('fs')
    const files = readdirSync(migrationsDir)
      .filter((f) => f.endsWith('.sql'))
      .sort()

    for (const file of files) {
      if (appliedSet.has(file)) {
        console.log(`[migrate] ✓ Already applied: ${file}`)
        continue
      }

      const sql = readFileSync(join(migrationsDir, file), 'utf8')
      console.log(`[migrate] ▶ Applying: ${file}`)

      await client.query('BEGIN')
      try {
        await client.query(sql)
        await client.query('INSERT INTO _migrations (filename) VALUES ($1)', [file])
        await client.query('COMMIT')
        console.log(`[migrate] ✓ Applied: ${file}`)
      } catch (err) {
        await client.query('ROLLBACK')
        throw err
      }
    }

    console.log('[migrate] ✓ All migrations applied')
  } finally {
    client.release()
    await pool.end()
  }
}

migrate().catch((err) => {
  console.error('[migrate] Failed:', err.message)
  process.exit(1)
})

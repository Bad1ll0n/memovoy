import pg from 'pg'

const { Pool } = pg

// ── Uma DATE não tem hora, e por isso não tem fuso ───────────────────────────
//
// Por omissão o driver converte DATE num Date de JavaScript à meia-noite do
// fuso LOCAL do servidor. Em Portugal, em Maio, "2027-05-10" tornava-se
//
//     2027-05-09T23:00:00.000Z
//
// e a interface, que formata em UTC, mostrava 9 de Maio. A página do roteiro
// contradizia-se a si própria: o título dizia 2027-05-10 e o cabeçalho dizia
// 9/05/2027 — porque as datas de cada dia vivem no JSONB como texto e essas
// nunca sofreram o desvio.
//
// O erro está na conversão, não na formatação. Um Date de JavaScript é sempre
// um INSTANTE; uma DATE de SQL é um dia do calendário. Traduzir um no outro
// obriga a inventar uma hora, e a hora inventada é o que empurra o dia para
// trás em qualquer fuso à frente de UTC.
//
// Vem como texto 'YYYY-MM-DD', que é o que a coluna guarda. Quem quiser fazer
// contas faz `new Date('2027-05-10')`, que o JavaScript lê como meia-noite UTC
// e portanto não volta a deslizar.
//
// Só DATE. TIMESTAMPTZ (created_at e companhia) é mesmo um instante e continua
// a ser convertido — aí o Date é a representação certa.
const OID_DATE = 1082
pg.types.setTypeParser(OID_DATE, (valor) => valor)

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

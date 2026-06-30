// src/plugins/database.js
import fp from 'fastify-plugin'
import postgres from 'postgres'
import { config } from '../config/index.js'

async function databasePlugin(fastify) {
  const sql = postgres(config.db.url, {
    min: config.db.poolMin,
    max: config.db.poolMax,
    idle_timeout: 30,
    connect_timeout: 10,
    types: { bigint: postgres.BigInt },
    onnotice: (notice) => fastify.log.debug({ notice }, 'PostgreSQL notice'),
  })

  try {
    await sql`SELECT 1`
    fastify.log.info('✓ PostgreSQL ligado')
  } catch (err) {
    fastify.log.error({ err }, '✗ Falha na ligação ao PostgreSQL')
    throw err
  }

  // FIX #7: withUser rejeita userId nulo em vez de passar 'null' como string,
  // o que faria o cast ::UUID na BD lançar uma exceção opaca.
  const withUser = async (userId, role, fn) => {
    if (!userId) throw new Error('withUser requer userId não-nulo')
    return sql.begin(async (tx) => {
      await tx`SELECT set_config('app.current_user_id',   ${userId}, true)`
      await tx`SELECT set_config('app.current_user_role', ${role},   true)`
      return fn(tx)
    })
  }

  const transaction = async (fn) => sql.begin(fn)

  fastify.decorate('db', { sql, withUser, transaction })

  fastify.addHook('onClose', async () => {
    await sql.end()
    fastify.log.info('PostgreSQL pool fechado')
  })
}

// Patch global para serializar BigInt como Number
// COUNT(*) no PostgreSQL devolve BigInt — converter para Number
const originalStringify = JSON.stringify
BigInt.prototype.toJSON = function() { return Number(this) }

export default fp(databasePlugin, { name: 'database', fastify: '4.x' })

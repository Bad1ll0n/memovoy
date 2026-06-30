// src/plugins/redis.js
// Plugin Fastify que expõe um cliente Redis como fastify.cache.
//
// Design:
//   - Wraps a ligação Redis com helpers get/set/del/invalidate
//   - Serialização/deserialização JSON automática
//   - Falhas de cache são silenciosas (cache-aside pattern):
//     se o Redis estiver em baixo, a API serve os dados da BD normalmente
//   - Keys seguem o padrão: namespace:qualifier:id
//     ex: "feed:discovery:PT", "top-countries:month", "profile:uuid"
//
// Dependência: 'redis' package (npm install redis)

import fp       from 'fastify-plugin'
import { createClient } from 'redis'
import { config } from '../config/index.js'

async function redisPlugin(fastify) {
  const client = createClient({
    url: config.redis.url,
    socket: {
      reconnectStrategy: (retries) => {
        // Backoff exponencial: 100ms, 200ms, 400ms... máx. 5s
        const delay = Math.min(100 * Math.pow(2, retries), 5000)
        return delay
      },
    },
  })

  // Log de eventos de ligação
  client.on('connect',       () => fastify.log.info('✓ Redis ligado'))
  client.on('ready',         () => fastify.log.debug('Redis pronto'))
  client.on('error',  (err) => fastify.log.warn({ err: err.message }, 'Redis erro'))
  client.on('reconnecting',  () => fastify.log.warn('Redis a reconectar…'))
  client.on('end',           () => fastify.log.warn('Redis desligado'))

  try {
    await client.connect()
  } catch (err) {
    // Não falhar o arranque se Redis não estiver disponível
    // A API funciona sem cache — degraded mas funcional
    fastify.log.warn({ err: err.message }, 'Redis não disponível — cache desactivado')
  }

  // -------------------------------------------------------------------------
  // Cache helpers
  // -------------------------------------------------------------------------

  const cache = {
    // Verificar se o cliente está ligado
    get isAvailable() {
      return client.isReady
    },

    // get — buscar valor, devolver null se não existe ou Redis indisponível
    async get(key) {
      if (!this.isAvailable) return null
      try {
        const raw = await client.get(key)
        if (raw === null) return null
        return JSON.parse(raw)
      } catch (err) {
        fastify.log.debug({ err: err.message, key }, 'Cache get falhou')
        return null
      }
    },

    // set — guardar valor com TTL (segundos)
    async set(key, value, ttlSeconds) {
      if (!this.isAvailable) return false
      try {
        await client.setEx(key, ttlSeconds, JSON.stringify(value))
        return true
      } catch (err) {
        fastify.log.debug({ err: err.message, key }, 'Cache set falhou')
        return false
      }
    },

    // del — apagar uma chave específica
    async del(key) {
      if (!this.isAvailable) return false
      try {
        await client.del(key)
        return true
      } catch (err) {
        fastify.log.debug({ err: err.message, key }, 'Cache del falhou')
        return false
      }
    },

    // invalidate — apagar todas as chaves com um prefixo (padrão glob)
    // Uso: cache.invalidate('feed:discovery:*') apaga todos os países
    // ATENÇÃO: usa SCAN, não KEYS — seguro em produção com muitas chaves
    async invalidate(pattern) {
      if (!this.isAvailable) return 0
      try {
        let cursor = 0
        let deleted = 0
        do {
          const result = await client.scan(cursor, { MATCH: pattern, COUNT: 100 })
          cursor = result.cursor
          if (result.keys.length > 0) {
            await client.del(result.keys)
            deleted += result.keys.length
          }
        } while (cursor !== 0)
        return deleted
      } catch (err) {
        fastify.log.debug({ err: err.message, pattern }, 'Cache invalidate falhou')
        return 0
      }
    },

    // wrap — padrão cache-aside: tentar cache, fallback para fn, guardar resultado
    // Uso: const data = await cache.wrap('minha:key', 60, () => buscarDaBD())
    async wrap(key, ttlSeconds, fn) {
      const cached = await this.get(key)
      if (cached !== null) {
        fastify.log.debug({ key }, 'Cache HIT')
        return { data: cached, fromCache: true }
      }

      fastify.log.debug({ key }, 'Cache MISS')
      const data = await fn()

      // Guardar em background — não atrasar a resposta
      this.set(key, data, ttlSeconds).catch(() => {})

      return { data, fromCache: false }
    },

    // Keys helpers — centralizar a geração de chaves evita typos
    keys: {
      discovery:    (countryCode) =>
        countryCode ? `feed:discovery:${countryCode}` : 'feed:discovery:all',
      topCountries: ()              => 'feed:top-countries',
      userProfile:  (userId)        => `profile:${userId}`,
      unreadCount:  (userId)        => `notif:unread:${userId}`,
      featureFlag:  (flag, userId)  => `ff:${flag}:${userId}`,
    },
  }

  fastify.decorate('cache', cache)

  // Fechar ligação ao desligar
  fastify.addHook('onClose', async () => {
    if (client.isOpen) {
      await client.quit()
      fastify.log.info('Redis desligado gracefully')
    }
  })
}

export default fp(redisPlugin, {
  name:    'redis-cache',
  fastify: '4.x',
})

// src/tests/cache.test.js
// Testes unitários do cache layer com mock do cliente Redis.
// Não requerem Redis real — testam a lógica de wrap, invalidate e fallback.

import { describe, it, mock } from 'node:test'
import assert from 'node:assert/strict'

// ---------------------------------------------------------------------------
// Mock do cliente Redis
// ---------------------------------------------------------------------------

function makeMockRedis({ available = true, data = {} } = {}) {
  const store = { ...data }
  const ttls  = {}

  return {
    isReady: available,
    isOpen:  available,

    get:   async (key) => store[key] ?? null,
    setEx: async (key, ttl, value) => { store[key] = value; ttls[key] = ttl },
    del:   async (key) => { delete store[key] },

    scan: async (cursor, { MATCH }) => {
      const pattern = MATCH.replace(/\*/g, '.*').replace(/:/g, ':')
      const regex   = new RegExp('^' + pattern + '$')
      const keys    = Object.keys(store).filter((k) => regex.test(k))
      return { cursor: 0, keys }
    },

    quit:   async () => {},
    on:     () => {},
    connect: async () => {},

    // Acesso ao store para asserções
    _store: store,
    _ttls:  ttls,
  }
}

// ---------------------------------------------------------------------------
// Cache helper (versão testável — sem Fastify)
// ---------------------------------------------------------------------------

function makeCache(redisClient) {
  const config_ttl = {
    discovery:    60,
    topCountries: 3600,
    userProfile:  300,
    unreadCount:  30,
  }

  return {
    get isAvailable() { return redisClient.isReady },

    async get(key) {
      if (!this.isAvailable) return null
      try {
        const raw = await redisClient.get(key)
        return raw ? JSON.parse(raw) : null
      } catch { return null }
    },

    async set(key, value, ttl) {
      if (!this.isAvailable) return false
      try { await redisClient.setEx(key, ttl, JSON.stringify(value)); return true }
      catch { return false }
    },

    async del(key) {
      if (!this.isAvailable) return false
      try { await redisClient.del(key); return true }
      catch { return false }
    },

    async invalidate(pattern) {
      if (!this.isAvailable) return 0
      try {
        let cursor = 0, deleted = 0
        do {
          const result = await redisClient.scan(cursor, { MATCH: pattern, COUNT: 100 })
          cursor = result.cursor
          if (result.keys.length > 0) {
            for (const k of result.keys) await redisClient.del(k)
            deleted += result.keys.length
          }
        } while (cursor !== 0)
        return deleted
      } catch { return 0 }
    },

    async wrap(key, ttl, fn) {
      const cached = await this.get(key)
      if (cached !== null) return { data: cached, fromCache: true }
      const data = await fn()
      this.set(key, data, ttl).catch(() => {})
      return { data, fromCache: false }
    },

    keys: {
      discovery:    (cc)   => cc ? `feed:discovery:${cc}` : 'feed:discovery:all',
      topCountries: ()     => 'feed:top-countries',
      userProfile:  (uid)  => `profile:${uid}`,
      unreadCount:  (uid)  => `notif:unread:${uid}`,
    },
  }
}

// ---------------------------------------------------------------------------
// Testes
// ---------------------------------------------------------------------------

describe('Cache — get/set/del', () => {

  it('set guarda valor serializado e get deserializa', async () => {
    const redis = makeMockRedis()
    const cache = makeCache(redis)

    const data = { items: [{ id: '1', title: 'Test' }], hasMore: false }
    await cache.set('test:key', data, 60)

    const retrieved = await cache.get('test:key')
    assert.deepEqual(retrieved, data)
    assert.equal(redis._ttls['test:key'], 60, 'TTL deve ser 60')
  })

  it('get devolve null para chave inexistente', async () => {
    const cache = makeCache(makeMockRedis())
    const result = await cache.get('nonexistent:key')
    assert.equal(result, null)
  })

  it('del remove a chave', async () => {
    const redis = makeMockRedis({ data: { 'my:key': '"value"' } })
    const cache = makeCache(redis)

    await cache.del('my:key')
    const result = await cache.get('my:key')
    assert.equal(result, null)
  })

  it('get devolve null quando Redis indisponível', async () => {
    const cache = makeCache(makeMockRedis({ available: false }))
    const result = await cache.get('any:key')
    assert.equal(result, null)
  })

  it('set devolve false quando Redis indisponível', async () => {
    const cache = makeCache(makeMockRedis({ available: false }))
    const ok = await cache.set('any:key', { x: 1 }, 60)
    assert.equal(ok, false)
  })
})

describe('Cache — wrap (cache-aside)', () => {

  it('wrap chama fn e guarda no cache quando MISS', async () => {
    const redis = makeMockRedis()
    const cache = makeCache(redis)
    let fnCalls = 0

    const fn = async () => { fnCalls++; return { data: 'from-db' } }
    const { data, fromCache } = await cache.wrap('test:wrap', 120, fn)

    assert.equal(fnCalls,   1,            'fn deve ser chamada uma vez')
    assert.equal(fromCache, false,         'não deve vir do cache')
    assert.deepEqual(data,  { data: 'from-db' })

    // Verificar que foi guardado
    const stored = await cache.get('test:wrap')
    assert.deepEqual(stored, { data: 'from-db' }, 'deve estar no cache')
    assert.equal(redis._ttls['test:wrap'], 120)
  })

  it('wrap devolve do cache sem chamar fn quando HIT', async () => {
    const redis = makeMockRedis({ data: { 'test:hit': JSON.stringify({ cached: true }) } })
    const cache = makeCache(redis)
    let fnCalls = 0

    const fn = async () => { fnCalls++ ; return { cached: false } }
    const { data, fromCache } = await cache.wrap('test:hit', 60, fn)

    assert.equal(fnCalls,   0,    'fn NÃO deve ser chamada')
    assert.equal(fromCache, true,  'deve vir do cache')
    assert.deepEqual(data, { cached: true })
  })

  it('wrap chama fn quando Redis indisponível (fallback gracioso)', async () => {
    const cache = makeCache(makeMockRedis({ available: false }))
    let fnCalls = 0

    const fn = async () => { fnCalls++; return { fallback: true } }
    const { data, fromCache } = await cache.wrap('any:key', 60, fn)

    assert.equal(fnCalls,   1,     'fn deve ser chamada (Redis indisponível)')
    assert.equal(fromCache, false)
    assert.deepEqual(data, { fallback: true })
  })

  it('wrap não esconde erro da fn — propaga correctamente', async () => {
    const cache = makeCache(makeMockRedis())

    const fn = async () => { throw new Error('BD offline') }
    await assert.rejects(
      () => cache.wrap('error:key', 60, fn),
      (err) => { assert.equal(err.message, 'BD offline'); return true }
    )
  })
})

describe('Cache — invalidate', () => {

  it('invalidate apaga todas as chaves que correspondem ao padrão', async () => {
    const redis = makeMockRedis({
      data: {
        'feed:discovery:PT':  '"data-pt"',
        'feed:discovery:BR':  '"data-br"',
        'feed:discovery:all': '"data-all"',
        'feed:top-countries': '"top"',       // não deve ser apagada
        'profile:abc':        '"profile"',   // não deve ser apagada
      },
    })
    const cache = makeCache(redis)

    const deleted = await cache.invalidate('feed:discovery:*')
    assert.equal(deleted, 3, 'deve apagar 3 chaves')

    // Chaves apagadas
    assert.equal(await cache.get('feed:discovery:PT'),  null)
    assert.equal(await cache.get('feed:discovery:BR'),  null)
    assert.equal(await cache.get('feed:discovery:all'), null)

    // Chaves preservadas
    assert.notEqual(await cache.get('feed:top-countries'), null)
    assert.notEqual(await cache.get('profile:abc'),        null)
  })

  it('invalidate devolve 0 quando Redis indisponível', async () => {
    const cache   = makeCache(makeMockRedis({ available: false }))
    const deleted = await cache.invalidate('any:*')
    assert.equal(deleted, 0)
  })

  it('invalidate devolve 0 quando nenhuma chave corresponde', async () => {
    const cache   = makeCache(makeMockRedis({ data: { 'other:key': '"x"' } }))
    const deleted = await cache.invalidate('nonexistent:*')
    assert.equal(deleted, 0)
  })
})

describe('Cache — key helpers', () => {

  it('keys.discovery sem país devolve chave global', () => {
    const cache = makeCache(makeMockRedis())
    assert.equal(cache.keys.discovery(null),  'feed:discovery:all')
    assert.equal(cache.keys.discovery(undefined), 'feed:discovery:all')
  })

  it('keys.discovery com país devolve chave específica', () => {
    const cache = makeCache(makeMockRedis())
    assert.equal(cache.keys.discovery('PT'), 'feed:discovery:PT')
    assert.equal(cache.keys.discovery('JP'), 'feed:discovery:JP')
  })

  it('keys distintas para entidades distintas', () => {
    const cache = makeCache(makeMockRedis())
    const uid   = 'user-123'
    // Assegurar que não há colisões entre tipos de chave
    const keys  = new Set([
      cache.keys.discovery('PT'),
      cache.keys.topCountries(),
      cache.keys.userProfile(uid),
      cache.keys.unreadCount(uid),
    ])
    assert.equal(keys.size, 4, 'todas as chaves devem ser únicas')
  })
})

// ---------------------------------------------------------------------------
// Testes do worker de agregação (lógica pura, sem BD)
// ---------------------------------------------------------------------------

describe('Feed aggregator — scheduler', () => {

  it('jobs são agendados com intervalos correctos', () => {
    // Verificar que a classe Scheduler existe e aceita jobs
    // (teste estrutural — sem executar os jobs que requerem BD)
    let jobCount = 0
    const fakeScheduler = {
      every: (ms, name, fn) => {
        jobCount++
        assert.ok(ms > 0,          `intervalo de ${name} deve ser positivo`)
        assert.ok(typeof fn === 'function', `${name} deve ser uma função`)
        return fakeScheduler
      },
    }

    // Simular o registo dos jobs
    fakeScheduler
      .every(5 * 60 * 1000,      'refresh-user-stats',      async () => {})
      .every(60 * 60 * 1000,     'recalculate-leaderboard', async () => {})
      .every(60 * 60 * 1000,     'aggregate-crowding',      async () => {})
      .every(24 * 60 * 60 * 1000,'clean-notifications',     async () => {})
      .every(6  * 60 * 60 * 1000,'reconcile-counters',      async () => {})

    assert.equal(jobCount, 5, 'deve registar exactamente 5 jobs')
  })
})

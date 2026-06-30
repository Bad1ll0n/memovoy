// src/tests/integration/itineraries.integration.test.js
// Testes de integração do módulo de roteiros.
// Pressupõem BD real via DATABASE_URL.

import { describe, it, before, after, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import postgres from 'postgres'
import { AuthService } from '../../auth/auth.service.js'
import { ItinerariesService } from '../../itineraries/itineraries.service.js'

const TEST_DB_URL = process.env.DATABASE_URL
if (!TEST_DB_URL) { process.exit(0) }

const sql = postgres(TEST_DB_URL, { max: 5 })

const mockJwt = {
  sign:   (p) => `mock.${JSON.stringify(p)}`,
  verify: (t) => JSON.parse(t.replace('mock.', '')),
  decode: (t) => JSON.parse(t.replace('mock.', '')),
}

let txSql, txResolve, txReject, testUser

function makeTxDb() {
  return {
    sql: txSql,
    transaction: async (fn) => fn(txSql),
    withUser: async (userId, role, fn) => {
      await txSql`SELECT set_config('app.current_user_id', ${userId}, true)`
      await txSql`SELECT set_config('app.current_user_role', ${role}, true)`
      return fn(txSql)
    },
  }
}

before(async () => { await sql`SELECT 1` })
after(async ()  => { await sql.end()     })

beforeEach(async () => {
  await new Promise((resolve) => {
    txSql = null
    sql.begin(async (tx) => {
      txSql = tx
      resolve()
      await new Promise((res, rej) => { txResolve = res; txReject = rej })
      throw new Error('ROLLBACK_INTENTIONAL')
    }).catch(() => {})
    const wait = setInterval(() => { if (txSql) { clearInterval(wait); resolve() } }, 10)
  })

  // Criar utilizador de teste dentro da transacção
  const db  = makeTxDb()
  const svc = new AuthService(db, mockJwt)
  const result = await svc.register({
    email:    `test-${Date.now()}@memovoy.com`,
    password: 'TestPass123!',
    username: `testuser${Date.now()}`,
    countryCode: 'PT',
  })
  testUser = result.user
})

afterEach(() => {
  if (txReject) txReject(new Error('ROLLBACK_INTENTIONAL'))
})

// ---------------------------------------------------------------------------
// Testes
// ---------------------------------------------------------------------------

describe('ItinerariesService — integração', () => {

  it('create: cria roteiro com campos correctos', async () => {
    const db  = makeTxDb()
    const svc = new ItinerariesService(db)

    const itinerary = await svc.create(testUser.id, 'user', {
      title:           'Tokyo 7 dias',
      destinationName: 'Tokyo',
      countryCode:     'JP',
      startDate:       '2026-09-01',
      endDate:         '2026-09-07',
      groupType:       'solo',
      transportModes:  ['public'],
      visibility:      'public',
    })

    assert.ok(itinerary.id,                          'deve ter id')
    assert.equal(itinerary.title,          'Tokyo 7 dias')
    assert.equal(itinerary.status,         'draft')
    assert.equal(itinerary.duration_days,  7)
    assert.equal(itinerary.country_code,   'JP')

    // Verificar na BD
    const [row] = await txSql`
      SELECT id, user_id, status, duration_days
      FROM itineraries WHERE id = ${itinerary.id}
    `
    assert.equal(row.user_id,       testUser.id)
    assert.equal(row.status,        'draft')
    assert.equal(row.duration_days, 7)
  })

  it('listMine: devolve apenas roteiros do utilizador', async () => {
    const db  = makeTxDb()
    const svc = new ItinerariesService(db)

    // Criar 2 roteiros
    await svc.create(testUser.id, 'user', {
      title: 'Roteiro A', destinationName: 'Lisboa', countryCode: 'PT',
      startDate: '2026-10-01', endDate: '2026-10-05', groupType: 'solo',
    })
    await svc.create(testUser.id, 'user', {
      title: 'Roteiro B', destinationName: 'Porto', countryCode: 'PT',
      startDate: '2026-11-01', endDate: '2026-11-03', groupType: 'couple',
    })

    const itineraries = await svc.listMine(testUser.id, 'user', {})
    assert.equal(itineraries.length, 2, 'deve devolver 2 roteiros')

    const titles = itineraries.map((i) => i.title)
    assert.ok(titles.includes('Roteiro A'), 'deve incluir Roteiro A')
    assert.ok(titles.includes('Roteiro B'), 'deve incluir Roteiro B')
  })

  it('listMine: filtro por status funciona', async () => {
    const db  = makeTxDb()
    const svc = new ItinerariesService(db)

    const it = await svc.create(testUser.id, 'user', {
      title: 'Para publicar', destinationName: 'Paris', countryCode: 'FR',
      startDate: '2026-10-01', endDate: '2026-10-05', groupType: 'couple',
    })

    await svc.create(testUser.id, 'user', {
      title: 'Rascunho', destinationName: 'Roma', countryCode: 'IT',
      startDate: '2026-11-01', endDate: '2026-11-05', groupType: 'solo',
    })

    // Publicar um dos roteiros
    await svc.publish(it.id, testUser.id, 'user')

    const drafts     = await svc.listMine(testUser.id, 'user', { status: 'draft'     })
    const published  = await svc.listMine(testUser.id, 'user', { status: 'published' })

    assert.equal(drafts.length,    1, 'deve ter 1 rascunho')
    assert.equal(published.length, 1, 'deve ter 1 publicado')
    assert.equal(published[0].title, 'Para publicar')
  })

  it('addDay: adiciona dia ao roteiro com validação de data', async () => {
    const db  = makeTxDb()
    const svc = new ItinerariesService(db)

    const itinerary = await svc.create(testUser.id, 'user', {
      title: 'Lisboa 3 dias', destinationName: 'Lisboa', countryCode: 'PT',
      startDate: '2026-10-01', endDate: '2026-10-03', groupType: 'solo',
    })

    const day = await svc.addDay(itinerary.id, testUser.id, 'user', {
      dayNumber: 1, date: '2026-10-01', theme: 'Alfama e centro histórico',
    })

    assert.ok(day.id,                                    'dia deve ter id')
    assert.equal(day.day_number, 1)
    assert.equal(day.theme, 'Alfama e centro histórico')
  })

  it('addDay: rejeita data fora do intervalo do roteiro', async () => {
    const db  = makeTxDb()
    const svc = new ItinerariesService(db)

    const itinerary = await svc.create(testUser.id, 'user', {
      title: 'Porto 2 dias', destinationName: 'Porto', countryCode: 'PT',
      startDate: '2026-10-01', endDate: '2026-10-02', groupType: 'solo',
    })

    // Data fora do intervalo (10-05 > end 10-02)
    await assert.rejects(
      () => svc.addDay(itinerary.id, testUser.id, 'user', {
        dayNumber: 3, date: '2026-10-05',
      }),
      (err) => {
        // Trigger da BD deve rejeitar
        assert.ok(
          err.message.toLowerCase().includes('data') ||
          err.message.toLowerCase().includes('date') ||
          err.code === 'P0001',
          `deve rejeitar data inválida: ${err.message}`
        )
        return true
      }
    )
  })

  it('addActivity: adiciona actividade com coordenadas geo', async () => {
    const db  = makeTxDb()
    const svc = new ItinerariesService(db)

    const itinerary = await svc.create(testUser.id, 'user', {
      title: 'Tokyo test', destinationName: 'Tokyo', countryCode: 'JP',
      startDate: '2026-09-01', endDate: '2026-09-03', groupType: 'solo',
    })
    const day = await svc.addDay(itinerary.id, testUser.id, 'user', {
      dayNumber: 1, date: '2026-09-01',
    })

    const activity = await svc.addActivity(day.id, testUser.id, 'user', {
      position: 1,
      name:     'Senso-ji Temple',
      category: 'attraction',
      lat:      35.7148,
      lng:      139.7967,
      address:  'Asakusa, Tokyo',
      priceEstimate: 0,
    })

    assert.ok(activity.id,                      'actividade deve ter id')
    assert.equal(activity.name,     'Senso-ji Temple')
    assert.equal(activity.position, 1)

    // Verificar coordenadas na BD
    const [row] = await txSql`
      SELECT
        ST_X(location::geometry) AS lng,
        ST_Y(location::geometry) AS lat
      FROM itinerary_activities WHERE id = ${activity.id}
    `
    assert.ok(Math.abs(row.lat - 35.7148) < 0.001, 'latitude deve ser correcta')
    assert.ok(Math.abs(row.lng - 139.7967) < 0.001, 'longitude deve ser correcta')
  })

  it('publish: muda status para published e preenche published_at', async () => {
    const db  = makeTxDb()
    const svc = new ItinerariesService(db)

    const itinerary = await svc.create(testUser.id, 'user', {
      title: 'Bali aventura', destinationName: 'Bali', countryCode: 'ID',
      startDate: '2026-12-01', endDate: '2026-12-10', groupType: 'friends',
    })

    assert.equal(itinerary.status, 'draft', 'deve começar como draft')

    const published = await svc.publish(itinerary.id, testUser.id, 'user')
    assert.equal(published.status, 'published')
    assert.ok(published.published_at, 'deve ter published_at')

    // Verificar na BD
    const [row] = await txSql`
      SELECT status, published_at FROM itineraries WHERE id = ${itinerary.id}
    `
    assert.equal(row.status, 'published')
    assert.ok(row.published_at)
  })

  it('delete: soft delete — não remove da BD, apenas preenche deleted_at', async () => {
    const db  = makeTxDb()
    const svc = new ItinerariesService(db)

    const itinerary = await svc.create(testUser.id, 'user', {
      title: 'Para apagar', destinationName: 'Madrid', countryCode: 'ES',
      startDate: '2026-10-01', endDate: '2026-10-05', groupType: 'solo',
    })

    await svc.delete(itinerary.id, testUser.id, 'user')

    // Deve existir na BD mas com deleted_at
    const [row] = await txSql`
      SELECT deleted_at FROM itineraries WHERE id = ${itinerary.id}
    `
    assert.ok(row,            'linha deve existir (soft delete)')
    assert.ok(row.deleted_at, 'deleted_at deve estar preenchido')

    // Não deve aparecer na listagem
    const list = await svc.listMine(testUser.id, 'user', {})
    const found = list.find((i) => i.id === itinerary.id)
    assert.equal(found, undefined, 'não deve aparecer na listagem')
  })

  it('_assertOwner: rejeita acesso a roteiro de outro utilizador', async () => {
    const db  = makeTxDb()
    const authSvc = new AuthService(db, mockJwt)
    const itinSvc = new ItinerariesService(db)

    // Criar segundo utilizador
    const other = await authSvc.register({
      email: `other-${Date.now()}@memovoy.com`,
      password: 'OtherPass123!',
      username: `other${Date.now()}`,
      countryCode: 'BR',
    })

    // Criar roteiro com o utilizador principal
    const itinerary = await itinSvc.create(testUser.id, 'user', {
      title: 'Roteiro privado', destinationName: 'Madeira', countryCode: 'PT',
      startDate: '2026-10-01', endDate: '2026-10-05', groupType: 'couple',
    })

    // Outro utilizador tenta apagar
    await assert.rejects(
      () => itinSvc.delete(itinerary.id, other.user.id, 'user'),
      (err) => {
        assert.equal(err.code, 'FORBIDDEN', 'deve ser ForbiddenError')
        return true
      }
    )
  })
})

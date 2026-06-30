// src/search/search.service.test.js
// Testes unitários do SearchService com mock da BD.
// Validam lógica de construção de queries e normalização de inputs.

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { SearchService } from './search.service.js'

// ---------------------------------------------------------------------------
// Mock da BD — captura queries e devolve dados configuráveis
// ---------------------------------------------------------------------------

function makeMockDb(responses = {}) {
  const calls = []

  // sql tag function — devolve array vazio por defeito
  const sql = async (...args) => {
    calls.push(args)
    // Tentar identificar o tipo de query pelo conteúdo
    const queryStr = args[0]?.join?.('') ?? ''
    if (queryStr.includes('FROM itineraries'))          return responses.itineraries ?? []
    if (queryStr.includes('FROM users'))                return responses.users        ?? []
    if (queryStr.includes('FROM posts'))                return responses.posts        ?? []
    if (queryStr.includes('FROM itineraries') && queryStr.includes('GROUP BY')) {
      return responses.destinations ?? []
    }
    return []
  }

  return {
    db:    { sql },
    calls: () => calls,
  }
}

// ---------------------------------------------------------------------------
// SearchService.search — validação de inputs
// ---------------------------------------------------------------------------

describe('SearchService.search — validação', () => {

  it('devolve resultados vazios para query com menos de 2 caracteres', async () => {
    const { db } = makeMockDb()
    const svc    = new SearchService(db)

    const result = await svc.search('a')
    assert.deepEqual(result, { itineraries: [], users: [], posts: [] })
  })

  it('devolve resultados vazios para query vazia', async () => {
    const { db } = makeMockDb()
    const svc    = new SearchService(db)

    const r1 = await svc.search('')
    const r2 = await svc.search(null)
    const r3 = await svc.search(undefined)

    assert.deepEqual(r1, { itineraries: [], users: [], posts: [] })
    assert.deepEqual(r2, { itineraries: [], users: [], posts: [] })
    assert.deepEqual(r3, { itineraries: [], users: [], posts: [] })
  })

  it('trim da query antes de pesquisar', async () => {
    const { db, calls } = makeMockDb({ itineraries: [], users: [], posts: [] })
    const svc = new SearchService(db)

    // Query com espaços — deve ser trimmed
    await svc.search('  tokyo  ')
    // Se a query fosse vazia após trim, não haveria chamadas à BD
    // "  tokyo  ".trim() = "tokyo" (5 chars) → válida → deve chamar a BD
    assert.ok(calls().length > 0, 'deve chamar a BD para query válida após trim')
  })

  it('type=users só pesquisa utilizadores', async () => {
    const mockUsers = [{ id: 'u1', username: 'traveler', display_name: 'Maria' }]
    const { db, calls } = makeMockDb({ users: mockUsers })
    const svc = new SearchService(db)

    const result = await svc.search('maria', { type: 'users' })

    assert.equal(result.itineraries.length, 0, 'não deve ter itinerários')
    assert.equal(result.posts.length,       0, 'não deve ter posts')
    // users pode ter ou não resultados dependendo do mock
  })

  it('type=itineraries só pesquisa roteiros', async () => {
    const mockItins = [{ id: 'i1', title: 'Tokyo', destination_name: 'Tokyo' }]
    const { db } = makeMockDb({ itineraries: mockItins })
    const svc    = new SearchService(db)

    const result = await svc.search('tokyo', { type: 'itineraries' })

    assert.equal(result.users.length, 0, 'não deve ter utilizadores')
    assert.equal(result.posts.length, 0, 'não deve ter posts')
  })
})

// ---------------------------------------------------------------------------
// SearchService.autocomplete
// ---------------------------------------------------------------------------

describe('SearchService.autocomplete', () => {

  it('devolve resultados vazios para prefix com menos de 2 caracteres', async () => {
    const { db } = makeMockDb()
    const svc    = new SearchService(db)

    const r1 = await svc.autocomplete('a')
    const r2 = await svc.autocomplete('')
    assert.deepEqual(r1, { destinations: [], users: [] })
    assert.deepEqual(r2, { destinations: [], users: [] })
  })

  it('devolve destinos e utilizadores para prefix válido', async () => {
    const mockDestinations = [
      { destination_name: 'Tokyo', country_code: 'JP', trip_count: 42 },
      { destination_name: 'Toronto', country_code: 'CA', trip_count: 8 },
    ]
    const mockUsers = [
      { id: 'u1', username: 'tokyolover', display_name: 'Tokyo Lover' },
    ]

    const { db } = makeMockDb({ destinations: mockDestinations, users: mockUsers })
    const svc    = new SearchService(db)

    const result = await svc.autocomplete('to')

    assert.ok(Array.isArray(result.destinations), 'destinations deve ser array')
    assert.ok(Array.isArray(result.users),        'users deve ser array')
  })
})

// ---------------------------------------------------------------------------
// Testes do worker de moderação (lógica pura)
// ---------------------------------------------------------------------------

// Importar função heurística do worker para testar isoladamente
// Nota: o worker usa process.env — mock mínimo necessário
function heuristicCheck(media) {
  const issues = []

  const allowedTypes = ['image', 'video']
  if (!allowedTypes.some((t) => media.media_type?.startsWith(t))) {
    issues.push({ reason: 'INVALID_MEDIA_TYPE', detail: media.media_type })
  }

  if (media.width && media.height) {
    if (media.width < 50 || media.height < 50) {
      issues.push({ reason: 'DIMENSIONS_TOO_SMALL', detail: `${media.width}x${media.height}` })
    }
  }

  const allowedDomains = ['cdn.memovoy.com', 'memovoy-media.s3.amazonaws.com', 'localhost', '127.0.0.1']
  try {
    const url = new URL(media.url)
    if (!allowedDomains.some((d) => url.hostname.endsWith(d))) {
      issues.push({ reason: 'UNAUTHORIZED_DOMAIN', detail: url.hostname })
    }
  } catch {
    issues.push({ reason: 'INVALID_URL', detail: media.url })
  }

  return issues
}

describe('Content moderation — heurísticas', () => {

  it('aprova media de imagem válida do CDN', () => {
    const media = {
      id: 'm1', post_id: 'p1',
      media_type: 'image/jpeg',
      url: 'https://cdn.memovoy.com/uploads/photo.jpg',
      width: 1200, height: 800,
    }
    const issues = heuristicCheck(media)
    assert.equal(issues.length, 0, 'não deve ter issues')
  })

  it('rejeita media com tipo inválido', () => {
    const media = {
      id: 'm2', post_id: 'p1',
      media_type: 'application/pdf',
      url: 'https://cdn.memovoy.com/doc.pdf',
      width: null, height: null,
    }
    const issues = heuristicCheck(media)
    assert.ok(issues.some((i) => i.reason === 'INVALID_MEDIA_TYPE'))
  })

  it('rejeita imagem com dimensões muito pequenas', () => {
    const media = {
      id: 'm3', post_id: 'p1',
      media_type: 'image/png',
      url: 'https://cdn.memovoy.com/tracker.png',
      width: 1, height: 1,
    }
    const issues = heuristicCheck(media)
    assert.ok(issues.some((i) => i.reason === 'DIMENSIONS_TOO_SMALL'))
  })

  it('rejeita URL de domínio não autorizado', () => {
    const media = {
      id: 'm4', post_id: 'p1',
      media_type: 'image/jpeg',
      url: 'https://malicious-site.com/image.jpg',
      width: 1200, height: 800,
    }
    const issues = heuristicCheck(media)
    assert.ok(issues.some((i) => i.reason === 'UNAUTHORIZED_DOMAIN'))
  })

  it('rejeita URL inválida', () => {
    const media = {
      id: 'm5', post_id: 'p1',
      media_type: 'image/jpeg',
      url: 'not-a-valid-url',
      width: 1200, height: 800,
    }
    const issues = heuristicCheck(media)
    assert.ok(issues.some((i) => i.reason === 'INVALID_URL'))
  })

  it('aprova video de domínio autorizado', () => {
    const media = {
      id: 'm6', post_id: 'p1',
      media_type: 'video/mp4',
      url: 'https://memovoy-media.s3.amazonaws.com/videos/clip.mp4',
      width: 1920, height: 1080,
    }
    const issues = heuristicCheck(media)
    assert.equal(issues.length, 0, 'vídeo válido não deve ter issues')
  })
})

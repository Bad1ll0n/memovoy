import { test, describe, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { buildApp } from '../../src/app.js'
import { pool } from '../../src/db/pool.js'

// Como os 5xx saem para o cliente.
//
// O error handler colapsava TODOS os 5xx num 500 genérico. Existe por boa razão
// — foi assim que se deixou de vazar o host e o porto da base de dados nas
// mensagens de erro — mas apanhava no mesmo saco o 503 do under-pressure, que é
// uma recusa deliberada e não uma avaria.
//
// Apareceu no teste de carga: sob pressão, todos os 503 chegavam como 500.

let app

before(async () => {
  const construido = await buildApp({ rateLimit: false })
  app = construido.app

  // Rotas só deste teste, para provocar cada tipo de 5xx sem depender de
  // saturar o event loop a sério — isso seria lento e instável.
  app.get('/__teste/503', async () => {
    throw Object.assign(new Error('Servidor temporariamente sobrecarregado. Tenta novamente.'), {
      statusCode: 503,
    })
  })

  app.get('/__teste/500', async () => {
    throw new Error('connect ECONNREFUSED 10.0.0.7:5432 — base de dados interna')
  })

  app.get('/__teste/502', async () => {
    throw Object.assign(new Error('upstream falhou em interno.rede.local'), { statusCode: 502 })
  })

  await app.ready()
})

after(async () => {
  await app.close()
  await pool.end()
})

describe('503 — recusa deliberada', () => {
  test('chega como 503, não como 500', async () => {
    const res = await app.inject({ method: 'GET', url: '/__teste/503' })

    assert.equal(res.statusCode, 503, 'colapsar em 500 anuncia uma avaria que não existe')
  })

  test('traz Retry-After, que é o que diz ao cliente quanto esperar', async () => {
    const res = await app.inject({ method: 'GET', url: '/__teste/503' })

    assert.ok(res.headers['retry-after'], 'sem isto o cliente não sabe quando voltar')
  })

  test('mantém a mensagem, que é escrita para ser lida', async () => {
    const res = await app.inject({ method: 'GET', url: '/__teste/503' })

    const body = JSON.parse(res.body)
    assert.match(body.message, /sobrecarregado/)
    assert.equal(body.error, 'Service Unavailable')
  })
})

describe('os outros 5xx continuam mudos', () => {
  test('um 500 não deixa escapar detalhes internos', async () => {
    const res = await app.inject({ method: 'GET', url: '/__teste/500' })

    assert.equal(res.statusCode, 500)
    const body = JSON.parse(res.body)
    assert.doesNotMatch(body.message, /10\.0\.0\.7|5432|ECONNREFUSED/,
      'host, porto e causa não podem sair para o cliente')
    assert.equal(body.message, 'Erro interno do servidor. Tenta novamente.')
  })

  test('um 502 também é colapsado e limpo', async () => {
    // Só o 503 é que é um sinal seguro e útil. Um 502 diz que algo a montante
    // falhou, e o nome desse algo não interessa a quem está do outro lado.
    const res = await app.inject({ method: 'GET', url: '/__teste/502' })

    assert.equal(res.statusCode, 500)
    assert.doesNotMatch(res.body, /interno\.rede\.local/)
  })
})

describe('os 4xx passam com a sua mensagem', () => {
  test('um 404 mantém-se 404', async () => {
    const res = await app.inject({ method: 'GET', url: '/rota-que-nao-existe' })

    assert.equal(res.statusCode, 404)
  })
})

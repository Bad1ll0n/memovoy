import { test, describe, before, after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { query } from '../../src/db/pool.js'
import { criarApp, fecharApp, limparBaseDeDados, registarUtilizador, comToken } from './helpers.js'

// Respostas grandes chegavam vazias a qualquer browser.
//
// O padrão era este, e estava em 147 sítios:
//
//   app.get('/x', async (request, reply) => { reply.send(dados) })
//
// Num handler `async`, chamar reply.send() sem devolver nada faz a promessa
// resolver com `undefined` enquanto a resposta já vai a caminho. Sozinho isso
// passa despercebido — mas com o @fastify/compress pelo meio o stream fecha
// antes de tempo (ERR_STREAM_PREMATURE_CLOSE) e o corpo sai com zero bytes.
//
// Só acontece acima do threshold de compressão, 1024 bytes. Por isso ficou
// invisível enquanto a base de dados esteve vazia: as respostas eram todas
// pequenas de mais para serem comprimidas. Assim que houve conteúdo a sério, o
// /explore e o /rankings começaram a devolver nada, e a app parecia vazia.
//
// A correcção é `return reply.send(...)`, que é sempre válido em Fastify.

let app
let ana

before(async () => { app = await criarApp() })
after(async () => { await fecharApp(app) })

beforeEach(async () => {
  await limparBaseDeDados()
  ana = await registarUtilizador(app)
})

/** Cria publicações que cheguem para a resposta passar o limiar de compressão. */
async function encher(quantas = 30) {
  for (let i = 0; i < quantas; i++) {
    await query(
      `INSERT INTO posts (user_id, caption, images, destination)
       VALUES ($1, $2, '["/x.jpg"]'::jsonb, $3)`,
      [
        ana.user.id,
        `Publicação número ${i} com texto suficiente para a resposta crescer além do limiar de compressão de mil bytes.`,
        `Destino ${i}`,
      ],
    )
  }
}

describe('respostas acima do limiar de compressão', () => {
  test('o /explore devolve corpo quando o cliente aceita gzip', async () => {
    await encher()

    const res = await app.inject({
      method: 'GET', url: '/explore',
      headers: { ...comToken(ana.accessToken), 'accept-encoding': 'gzip' },
    })

    assert.equal(res.statusCode, 200)
    assert.ok(res.rawPayload.length > 0, 'o corpo não pode vir vazio')

    const semGzip = await app.inject({
      method: 'GET', url: '/explore',
      headers: { ...comToken(ana.accessToken), 'accept-encoding': 'identity' },
    })
    assert.ok(semGzip.rawPayload.length > 1024, 'o teste tem de gerar resposta acima do limiar')
  })

  test('o mesmo para o /feed', async () => {
    await encher()

    const res = await app.inject({
      method: 'GET', url: '/feed',
      headers: { ...comToken(ana.accessToken), 'accept-encoding': 'gzip' },
    })

    assert.equal(res.statusCode, 200)
    assert.ok(res.rawPayload.length > 0)
  })

  test('e para a exportação de dados do RGPD', async () => {
    // Esta é a pior de todas: é uma obrigação legal, e devolvia um ficheiro
    // vazio a quem pedisse os seus dados.
    await encher(20)

    const res = await app.inject({
      method: 'GET', url: '/users/me/export',
      headers: { ...comToken(ana.accessToken), 'accept-encoding': 'gzip' },
    })

    assert.equal(res.statusCode, 200)
    assert.ok(res.rawPayload.length > 0, 'a exportação não pode vir vazia')
  })
})

describe('o padrão que causava isto', () => {
  // Guarda estático: uma varredura ao código, para o padrão não voltar a
  // entrar. É mais barato e mais fiável do que testar 138 endpoints um a um.
  test('nenhum handler chama reply.send sem o devolver', () => {
    const dir = join(import.meta.dirname, '..', '..', 'src', 'routes')
    const suspeitas = []

    for (const nome of readdirSync(dir).filter((f) => f.endsWith('.js'))) {
      const linhas = readFileSync(join(dir, nome), 'utf8').split('\n')

      linhas.forEach((linha, i) => {
        // `reply.…send(` ou o começo de uma cadeia `reply` em várias linhas,
        // sem `return` à frente. O reply.raw do streaming SSE não conta: é uma
        // resposta manual que nunca passa pelo compressor.
        const encadeada = /^\s+reply\s*$/.test(linha)
        const directa = /^\s+reply(?:\.[A-Za-z]+\([^)]*\))*\.send\(/.test(linha)
        if ((encadeada || directa) && !linha.includes('return')) {
          suspeitas.push(`${nome}:${i + 1}  ${linha.trim().slice(0, 60)}`)
        }
      })
    }

    assert.deepEqual(suspeitas, [],
      'reply.send() sem return perde o corpo quando a resposta é comprimida')
  })
})

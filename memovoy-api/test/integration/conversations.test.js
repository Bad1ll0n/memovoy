import { test, describe, before, after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { query } from '../../src/db/pool.js'
import { criarApp, fecharApp, limparBaseDeDados, registarUtilizador, comToken } from './helpers.js'

// Conversas privadas: o pior erro possível aqui é alguém ler ou escrever numa
// conversa de que não faz parte. Cada rota verifica participação — estes testes
// existem para que continue assim.

let app
let ana, bruno, intruso

before(async () => { app = await criarApp() })
after(async () => { await fecharApp(app) })

beforeEach(async () => {
  await limparBaseDeDados()
  ana     = await registarUtilizador(app)
  bruno   = await registarUtilizador(app)
  intruso = await registarUtilizador(app)
})

/** Abre conversa entre dois utilizadores e devolve o id. */
async function abrirConversa(deQuem, comQuem) {
  const res = await app.inject({
    method: 'POST', url: '/conversations',
    headers: comToken(deQuem.accessToken),
    payload: { userId: comQuem.user.id },
  })
  if (res.statusCode >= 300) throw new Error(`abrir conversa falhou (${res.statusCode}): ${res.body}`)
  return JSON.parse(res.body).id
}

describe('POST /conversations', () => {
  test('exige autenticação', async () => {
    const res = await app.inject({ method: 'POST', url: '/conversations', payload: { userId: bruno.user.id } })
    assert.equal(res.statusCode, 401)
  })

  test('cria a conversa com os dois participantes', async () => {
    const convId = await abrirConversa(ana, bruno)

    const { rows } = await query(
      'SELECT user_id FROM conversation_participants WHERE conversation_id = $1 ORDER BY user_id',
      [convId],
    )
    assert.equal(rows.length, 2)
    assert.deepEqual(
      rows.map((r) => r.user_id).sort(),
      [ana.user.id, bruno.user.id].sort(),
    )
  })

  test('abrir a mesma conversa duas vezes não cria uma segunda', async () => {
    const primeira = await abrirConversa(ana, bruno)
    const segunda  = await abrirConversa(ana, bruno)

    assert.equal(primeira, segunda)

    const { rows } = await query('SELECT count(*)::int AS n FROM conversations')
    assert.equal(rows[0].n, 1)
  })

  test('reutiliza a conversa mesmo quando é o outro a abri-la', async () => {
    const daAna   = await abrirConversa(ana, bruno)
    const doBruno = await abrirConversa(bruno, ana)

    assert.equal(daAna, doBruno, 'devia ser a mesma conversa, não uma duplicada')
  })

  test('não deixa conversar consigo próprio', async () => {
    const res = await app.inject({
      method: 'POST', url: '/conversations',
      headers: comToken(ana.accessToken),
      payload: { userId: ana.user.id },
    })
    assert.equal(res.statusCode, 400)
  })

  test('rejeita userId que não seja uuid', async () => {
    const res = await app.inject({
      method: 'POST', url: '/conversations',
      headers: comToken(ana.accessToken),
      payload: { userId: 'nao-e-uuid' },
    })
    assert.equal(res.statusCode, 400)
  })
})

describe('GET /conversations/:id — acesso', () => {
  test('um participante lê a conversa', async () => {
    const convId = await abrirConversa(ana, bruno)

    const res = await app.inject({
      method: 'GET', url: `/conversations/${convId}`,
      headers: comToken(bruno.accessToken),
    })

    assert.equal(res.statusCode, 200)
  })

  test('quem não participa recebe 403', async () => {
    const convId = await abrirConversa(ana, bruno)

    const res = await app.inject({
      method: 'GET', url: `/conversations/${convId}`,
      headers: comToken(intruso.accessToken),
    })

    assert.equal(res.statusCode, 403)
  })

  test('o 403 não deixa escapar conteúdo da conversa', async () => {
    const convId = await abrirConversa(ana, bruno)
    await app.inject({
      method: 'POST', url: '/messages',
      headers: comToken(ana.accessToken),
      payload: { conversationId: convId, content: 'segredo-que-nao-pode-sair' },
    })

    const res = await app.inject({
      method: 'GET', url: `/conversations/${convId}`,
      headers: comToken(intruso.accessToken),
    })

    assert.equal(res.statusCode, 403)
    assert.doesNotMatch(res.body, /segredo-que-nao-pode-sair/)
  })

  test('sem autenticação devolve 401', async () => {
    const convId = await abrirConversa(ana, bruno)
    const res = await app.inject({ method: 'GET', url: `/conversations/${convId}` })
    assert.equal(res.statusCode, 401)
  })
})

describe('limpeza de conversas órfãs', () => {
  // A tabela conversations não tem user_id, por isso apagar uma conta não a
  // arrastava: ficava lá uma linha vazia e inalcançável, para sempre. Um
  // trigger em conversation_participants passa a apagá-la quando sai o último.

  test('apagar a conta do último participante remove a conversa', async () => {
    const convId = await abrirConversa(ana, bruno)

    await app.inject({ method: 'DELETE', url: '/users/me', headers: comToken(ana.accessToken) })
    await app.inject({ method: 'DELETE', url: '/users/me', headers: comToken(bruno.accessToken) })

    const { rows } = await query('SELECT 1 FROM conversations WHERE id = $1', [convId])
    assert.equal(rows.length, 0, 'a conversa devia ter desaparecido com o último participante')
  })

  test('a conversa sobrevive enquanto restar um participante', async () => {
    const convId = await abrirConversa(ana, bruno)

    await app.inject({ method: 'DELETE', url: '/users/me', headers: comToken(ana.accessToken) })

    const { rows } = await query('SELECT 1 FROM conversations WHERE id = $1', [convId])
    assert.equal(rows.length, 1, 'o Bruno ainda lá está')
  })

  test('as mensagens vão atrás da conversa', async () => {
    const convId = await abrirConversa(ana, bruno)
    await app.inject({
      method: 'POST', url: '/messages',
      headers: comToken(ana.accessToken),
      payload: { conversationId: convId, content: 'olá' },
    })

    await app.inject({ method: 'DELETE', url: '/users/me', headers: comToken(ana.accessToken) })
    await app.inject({ method: 'DELETE', url: '/users/me', headers: comToken(bruno.accessToken) })

    const { rows } = await query('SELECT count(*)::int AS n FROM messages WHERE conversation_id = $1', [convId])
    assert.equal(rows[0].n, 0)
  })
})

describe('GET /conversations — listagem', () => {
  test('só lista as conversas de quem pergunta', async () => {
    await abrirConversa(ana, bruno)

    const res = await app.inject({
      method: 'GET', url: '/conversations',
      headers: comToken(intruso.accessToken),
    })

    assert.equal(res.statusCode, 200)
    const body = JSON.parse(res.body)
    const lista = Array.isArray(body) ? body : body.conversations
    assert.equal(lista.length, 0, 'o intruso não participa em nenhuma conversa')
  })

  test('lista a conversa a ambos os participantes', async () => {
    await abrirConversa(ana, bruno)

    for (const quem of [ana, bruno]) {
      const res = await app.inject({
        method: 'GET', url: '/conversations',
        headers: comToken(quem.accessToken),
      })
      const body = JSON.parse(res.body)
      const lista = Array.isArray(body) ? body : body.conversations
      assert.equal(lista.length, 1)
    }
  })
})

describe('POST /messages', () => {
  test('um participante envia mensagem', async () => {
    const convId = await abrirConversa(ana, bruno)

    const res = await app.inject({
      method: 'POST', url: '/messages',
      headers: comToken(ana.accessToken),
      payload: { conversationId: convId, content: 'Olá!' },
    })

    assert.ok(res.statusCode < 300, `esperado 2xx, veio ${res.statusCode}: ${res.body}`)

    const { rows } = await query('SELECT sender_id, content FROM messages WHERE conversation_id = $1', [convId])
    assert.equal(rows.length, 1)
    assert.equal(rows[0].sender_id, ana.user.id)
    assert.equal(rows[0].content, 'Olá!')
  })

  test('quem não participa não escreve — 403 e nada é gravado', async () => {
    const convId = await abrirConversa(ana, bruno)

    const res = await app.inject({
      method: 'POST', url: '/messages',
      headers: comToken(intruso.accessToken),
      payload: { conversationId: convId, content: 'intrometido' },
    })

    assert.equal(res.statusCode, 403)

    const { rows } = await query('SELECT count(*)::int AS n FROM messages WHERE conversation_id = $1', [convId])
    assert.equal(rows[0].n, 0)
  })

  test('mensagem vazia é rejeitada', async () => {
    const convId = await abrirConversa(ana, bruno)

    const res = await app.inject({
      method: 'POST', url: '/messages',
      headers: comToken(ana.accessToken),
      payload: { conversationId: convId, content: '' },
    })

    assert.equal(res.statusCode, 400)
  })

  test('conversa inexistente devolve 403, não 500', async () => {
    const res = await app.inject({
      method: 'POST', url: '/messages',
      headers: comToken(ana.accessToken),
      payload: { conversationId: '00000000-0000-0000-0000-000000000000', content: 'olá' },
    })

    assert.equal(res.statusCode, 403)
  })

  test('sem autenticação devolve 401', async () => {
    const convId = await abrirConversa(ana, bruno)
    const res = await app.inject({
      method: 'POST', url: '/messages',
      payload: { conversationId: convId, content: 'olá' },
    })
    assert.equal(res.statusCode, 401)
  })
})

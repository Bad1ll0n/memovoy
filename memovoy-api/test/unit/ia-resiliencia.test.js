import { test, describe, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import {
  definirClienteLlm,
  agentSuggestActivity,
  contadoresDaIa,
  reiniciarContadoresDaIa,
} from '../../src/services/aiAgent.js'

// Resiliência das chamadas ao modelo.
//
// O que já existia: uma retentativa em 5xx/ECONNRESET, com espera fixa. O que
// faltava: o 429 — que é a falha mais comum contra o Groq — não era repetido,
// os timeouts também não, não havia modelo de recurso, e os tokens eram
// registados linha a linha sem nunca serem somados.

/** Erro com forma de erro da API. */
function erroDaApi(status, extras = {}) {
  return Object.assign(new Error(`erro ${status}`), { status, ...extras })
}

/**
 * Cliente falso: devolve os erros da lista pela ordem dada e, esgotada a
 * lista, responde com sucesso. Guarda os modelos pedidos.
 */
function clienteQueFalha(erros, resposta = { suggestions: [{ name: 'Alfama' }] }) {
  const modelosPedidos = []
  let i = 0

  definirClienteLlm({
    chat: {
      completions: {
        create: async (params) => {
          modelosPedidos.push(params.model)
          if (i < erros.length) throw erros[i++]
          return {
            usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
            choices: [{ message: { content: JSON.stringify(resposta) } }],
          }
        },
      },
    },
  })

  return modelosPedidos
}

// agentSuggestActivity de propósito: não passa pela cache, que iria à base de
// dados, e os testes unitários correm sem uma.
const PEDIDO = { destination: 'Lisboa', currency: 'EUR', existingActivity: { name: 'x' }, feedback: 'outra coisa' }

beforeEach(() => reiniciarContadoresDaIa())

describe('retentativas', () => {
  test('um 429 é repetido, não devolvido como erro', async () => {
    // Era a falha mais comum e a única que não era repetida: 429 não é >= 500,
    // por isso caía fora da condição e o utilizador via um erro.
    const modelos = clienteQueFalha([erroDaApi(429)])

    const r = await agentSuggestActivity(PEDIDO)

    assert.equal(r.suggestions[0].name, 'Alfama')
    assert.equal(modelos.length, 2, 'devia ter tentado duas vezes')
    assert.equal(contadoresDaIa().retentativas, 1)
  })

  test('um timeout é repetido', async () => {
    const timeout = Object.assign(new Error('tempo esgotado'), { name: 'TimeoutError' })
    clienteQueFalha([timeout])

    const r = await agentSuggestActivity(PEDIDO)

    assert.equal(r.suggestions[0].name, 'Alfama')
  })

  test('um 500 é repetido', async () => {
    clienteQueFalha([erroDaApi(503)])

    const r = await agentSuggestActivity(PEDIDO)
    assert.equal(r.suggestions[0].name, 'Alfama')
  })

  test('um 400 não é repetido — o pedido está mal e vai falhar na mesma', async () => {
    const modelos = clienteQueFalha([erroDaApi(400), erroDaApi(400), erroDaApi(400), erroDaApi(400)])

    await assert.rejects(() => agentSuggestActivity(PEDIDO), /erro 400/)
    assert.equal(modelos.length, 1, 'uma tentativa e mais nada')
    assert.equal(contadoresDaIa().retentativas, 0)
  })

  test('as tentativas param a um limite', async () => {
    const modelos = clienteQueFalha(Array.from({ length: 20 }, () => erroDaApi(500)))

    await assert.rejects(() => agentSuggestActivity(PEDIDO))

    // Três tentativas com o modelo pedido, mais uma com o de recurso.
    assert.ok(modelos.length <= 4, `tentou ${modelos.length} vezes, é demais`)
  })
})

describe('modelo de recurso', () => {
  test('esgotadas as tentativas, tenta outro modelo', async () => {
    // Treze agentes dependiam de um único id de modelo estar vivo.
    const modelos = clienteQueFalha([erroDaApi(500), erroDaApi(500), erroDaApi(500)])

    const r = await agentSuggestActivity(PEDIDO)

    assert.equal(r.suggestions[0].name, 'Alfama')
    assert.notEqual(modelos.at(-1), modelos[0], 'a última tentativa foi noutro modelo')
    assert.equal(contadoresDaIa().recursos, 1)
  })

  test('um erro de pedido não desencadeia o recurso', async () => {
    // Um pedido malformado falha igual em qualquer modelo; repetir só gasta
    // outra chamada.
    const modelos = clienteQueFalha([erroDaApi(400)])

    await assert.rejects(() => agentSuggestActivity(PEDIDO))
    assert.equal(new Set(modelos).size, 1, 'só um modelo devia ter sido tentado')
    assert.equal(contadoresDaIa().recursos, 0)
  })
})

describe('contadores', () => {
  test('somam os tokens em vez de os deitar fora', async () => {
    clienteQueFalha([])

    await agentSuggestActivity(PEDIDO)
    await agentSuggestActivity({ ...PEDIDO, destination: 'Porto' })

    const c = contadoresDaIa()
    assert.equal(c.chamadas, 2)
    assert.equal(c.tokensPrompt, 20)
    assert.equal(c.tokensResposta, 10)
    assert.equal(c.tokensTotal, 30)
  })

  test('contam as falhas definitivas', async () => {
    clienteQueFalha(Array.from({ length: 10 }, () => erroDaApi(400)))

    await assert.rejects(() => agentSuggestActivity(PEDIDO))

    assert.equal(contadoresDaIa().falhas, 1)
  })
})

import { test, describe, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { agentStreamCaption, definirClienteLlm } from '../../src/services/aiAgent.js'

// Uma legenda cortada no limite de tokens não se distingue de uma legenda
// acabada. O campo vem preenchido, o pedido devolve 200, e a única diferença
// está no finish_reason — que o código não lia.
//
// Forcei o corte contra a API a sério para ver o que sai:
//
//     "Descobre o encanto das ruas de Alfama, onde cada azulejo conta uma
//      história e o Tejo reflete o pôr-do-sol. Deixa-te envolver pelos sabores
//      do pastel de nata e o fado que"
//
// Termina em "e o fado que". Nenhum erro foi lançado.

/** Um fluxo falso, para poder decidir a razão da paragem em vez de a torcer. */
function fluxoFalso(partes, razaoFinal) {
  return {
    async *[Symbol.asyncIterator]() {
      for (let i = 0; i < partes.length; i++) {
        const ultima = i === partes.length - 1
        yield {
          choices: [{
            delta: { content: partes[i] },
            finish_reason: ultima ? razaoFinal : null,
          }],
        }
      }
    },
  }
}

function clienteQueDevolve(fluxo) {
  return { chat: { completions: { create: async () => fluxo } } }
}

describe('uma legenda interrompida não passa por acabada', () => {
  afterEach(() => definirClienteLlm(null))

  test('quando o modelo acaba, o texto sai e não há erro', async () => {
    definirClienteLlm(clienteQueDevolve(
      fluxoFalso(['Lisboa ', 'ao ', 'pôr-do-sol.'], 'stop'),
    ))

    let texto = ''
    for await (const d of agentStreamCaption({ destination: 'Lisboa', images: [] })) texto += d

    assert.equal(texto, 'Lisboa ao pôr-do-sol.')
  })

  test('quando é interrompido, o que já saiu sai à mesma — e depois avisa', async () => {
    // As duas metades importam. Apagar o que o utilizador viu aparecer seria
    // pior do que deixá-lo lá; ficar calado faria de meia frase uma legenda.
    definirClienteLlm(clienteQueDevolve(
      fluxoFalso(['Deixa-te envolver ', 'pelo fado que'], 'length'),
    ))

    let texto = ''
    await assert.rejects(
      async () => {
        for await (const d of agentStreamCaption({ destination: 'Lisboa', images: [] })) texto += d
      },
      (e) => e.code === 'LEGENDA_CORTADA' && e.parcial === true,
    )

    assert.equal(texto, 'Deixa-te envolver pelo fado que', 'o parcial não se deita fora')
  })

  test('marca se chegou a sair alguma coisa, para quem chama poder distinguir', async () => {
    // Cortado com texto → o cliente mostra o que tem e assinala incompleto.
    // Cortado sem texto  → não há nada que mostrar; é uma falha e mais nada.
    definirClienteLlm(clienteQueDevolve(fluxoFalso([''], 'length')))

    await assert.rejects(
      async () => {
        for await (const _ of agentStreamCaption({ destination: 'Lisboa', images: [] })) { /* nada sai */ }
      },
      (e) => e.code === 'LEGENDA_CORTADA' && e.parcial === false,
    )
  })
})

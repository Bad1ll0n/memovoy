import { test, describe, before, after, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { query, pool } from '../../src/db/pool.js'
import { agentValidateDestination, definirClienteLlm } from '../../src/services/aiAgent.js'

// Os agentes de IA nunca tinham sido testados porque chamavam a API a sério.
// Com o cliente substituível, dá para exercitar o que importa: o que acontece
// quando o modelo devolve lixo, e se a cache poupa mesmo chamadas.
//
// Integração e não unitário porque a cache vive na base de dados.

/** Cliente falso que devolve as respostas indicadas, por ordem. */
function clienteFalso(respostas) {
  const chamadas = []
  return {
    chamadas,
    chat: {
      completions: {
        create: async (params) => {
          chamadas.push(params)
          const proxima = respostas.shift()
          if (proxima instanceof Error) throw proxima
          return {
            choices: [{ message: { content: JSON.stringify(proxima) } }],
            usage:   { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
          }
        },
      },
    },
  }
}

/** Cliente que devolve conteúdo cru, para simular JSON malformado. */
function clienteComTextoCru(texto) {
  return {
    chat: {
      completions: {
        create: async () => ({ choices: [{ message: { content: texto } }] }),
      },
    },
  }
}

const DESTINO_VALIDO = {
  normalizedName: 'Lisboa',
  country:        'Portugal',
  continent:      'Europa',
  currency:       'EUR',
  language:       'Português',
  timezone:       'Europe/Lisbon',
  bestTimeToVisit: 'Primavera',
  quickFacts:     ['Sete colinas', 'Eléctrico 28', 'Pastéis de Belém'],
}

before(async () => { await query('DELETE FROM ai_cache') })
after(async () => { await pool.end() })

beforeEach(async () => { await query('DELETE FROM ai_cache') })
afterEach(() => { definirClienteLlm(null) })

describe('agentValidateDestination — resposta válida', () => {
  test('devolve os dados do destino', async () => {
    definirClienteLlm(clienteFalso([DESTINO_VALIDO]))

    const r = await agentValidateDestination('lisboa')

    assert.equal(r.normalizedName, 'Lisboa')
    assert.equal(r.country, 'Portugal')
    assert.deepEqual(r.quickFacts, DESTINO_VALIDO.quickFacts)
  })

  test('impõe o esquema, não só JSON válido', async () => {
    // Este teste afirmava json_object e passou a falhar quando os agentes de
    // geração ganharam esquema estrito. Estava certo a falhar: o contrato
    // mudou, e para melhor.
    //
    // O json_object garante JSON *válido* e mais nada. Numa geração real, o
    // modelo devolveu «400 Failed to generate JSON» à primeira tentativa e
    // funcionou à segunda com o mesmo pedido. O json_schema com strict impõe
    // a forma durante a descodificação, em vez de a pedir no prompt.
    const cliente = clienteFalso([DESTINO_VALIDO])
    definirClienteLlm(cliente)

    await agentValidateDestination('lisboa')

    const formato = cliente.chamadas[0].response_format
    assert.equal(formato.type, 'json_schema')
    assert.equal(formato.json_schema.strict, true, 'sem strict não há descodificação restringida')
    assert.ok(formato.json_schema.schema.properties.normalizedName)
  })

  test('sanitiza a saída do modelo — HTML e null bytes', async () => {
    definirClienteLlm(clienteFalso([{
      ...DESTINO_VALIDO,
      normalizedName: '<b>Lisboa</b>',
      bestTimeToVisit: 'Primavera\u0000',
    }]))

    const r = await agentValidateDestination('lisboa')

    assert.equal(r.normalizedName, 'Lisboa')
    assert.equal(r.bestTimeToVisit, 'Primavera')
  })

  test('preserva os espaços do texto gerado', async () => {
    // Regressão do bug em que o regex de null bytes era um espaço literal e
    // colava as palavras de tudo o que a IA devolvia.
    definirClienteLlm(clienteFalso([{
      ...DESTINO_VALIDO,
      bestTimeToVisit: 'Primavera e início do Outono',
    }]))

    const r = await agentValidateDestination('lisboa')

    assert.equal(r.bestTimeToVisit, 'Primavera e início do Outono')
  })
})

describe('agentValidateDestination — resposta imprestável', () => {
  test('destino não reconhecido dá erro legível, não uma excepção crua', async () => {
    definirClienteLlm(clienteFalso([{ ...DESTINO_VALIDO, normalizedName: null }]))

    await assert.rejects(
      () => agentValidateDestination('asdkjhasd'),
      /não reconhecido/,
    )
  })

  test('JSON malformado rebenta em vez de devolver dados falsos', async () => {
    definirClienteLlm(clienteComTextoCru('isto não é JSON'))

    await assert.rejects(() => agentValidateDestination('lisboa'))
  })

  test('um destino recusado não fica em cache', async () => {
    definirClienteLlm(clienteFalso([{ ...DESTINO_VALIDO, normalizedName: null }]))
    await agentValidateDestination('inexistente').catch(() => {})

    const { rows } = await query('SELECT count(*)::int AS n FROM ai_cache')
    assert.equal(rows[0].n, 0, 'não vale a pena guardar uma recusa')
  })
})

describe('cache', () => {
  test('a segunda chamada não vai ao modelo', async () => {
    const cliente = clienteFalso([DESTINO_VALIDO, DESTINO_VALIDO])
    definirClienteLlm(cliente)

    await agentValidateDestination('lisboa')
    await agentValidateDestination('lisboa')

    assert.equal(cliente.chamadas.length, 1, 'a segunda devia ter vindo da cache')
  })

  test('a chave ignora maiúsculas e espaços em volta', async () => {
    const cliente = clienteFalso([DESTINO_VALIDO, DESTINO_VALIDO])
    definirClienteLlm(cliente)

    await agentValidateDestination('Lisboa')
    await agentValidateDestination('  lisboa  ')

    assert.equal(cliente.chamadas.length, 1)
  })

  test('destinos diferentes não partilham cache', async () => {
    const cliente = clienteFalso([DESTINO_VALIDO, { ...DESTINO_VALIDO, normalizedName: 'Porto' }])
    definirClienteLlm(cliente)

    await agentValidateDestination('lisboa')
    const porto = await agentValidateDestination('porto')

    assert.equal(cliente.chamadas.length, 2)
    assert.equal(porto.normalizedName, 'Porto')
  })

  test('a resposta guardada é a sanitizada, não a crua', async () => {
    definirClienteLlm(clienteFalso([{ ...DESTINO_VALIDO, normalizedName: '<i>Lisboa</i>' }]))
    await agentValidateDestination('lisboa')

    const { rows } = await query('SELECT response FROM ai_cache LIMIT 1')
    assert.equal(rows[0].response.normalizedName, 'Lisboa')
  })
})

describe('retentativa', () => {
  test('erro 5xx do modelo é tentado uma segunda vez', async () => {
    const erro = Object.assign(new Error('modelo em baixo'), { status: 503 })
    const cliente = clienteFalso([erro, DESTINO_VALIDO])
    definirClienteLlm(cliente)

    const r = await agentValidateDestination('lisboa')

    assert.equal(r.normalizedName, 'Lisboa')
    assert.equal(cliente.chamadas.length, 2, 'devia ter tentado duas vezes')
  })

  test('erro 4xx não é repetido — não vale a pena insistir', async () => {
    const erro = Object.assign(new Error('pedido inválido'), { status: 400 })
    const cliente = clienteFalso([erro, DESTINO_VALIDO])
    definirClienteLlm(cliente)

    await assert.rejects(() => agentValidateDestination('lisboa'))
    assert.equal(cliente.chamadas.length, 1)
  })
})

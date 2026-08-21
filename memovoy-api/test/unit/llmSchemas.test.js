import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { ESQUEMAS, ESQUEMA_DIAS, ESQUEMA_DESTINO } from '../../src/services/llmSchemas.js'

// O modo estrito não aceita JSON Schema completo: é um subconjunto com regras
// que, se falharem, dão um 400 do fornecedor em tempo de execução — não um erro
// de compilação, não um aviso, nada. E dá-o na geração de um roteiro real, ao
// utilizador, e não aqui.
//
// Estas regras não se adivinham a ler o esquema. Por isso ficam medidas.

/** Percorre todos os objectos de um esquema, incluindo os de dentro de arrays. */
function todosOsObjectos(no, acc = [], caminho = 'raiz') {
  if (!no || typeof no !== 'object') return acc

  const tipo = Array.isArray(no.type) ? no.type : [no.type]
  if (tipo.includes('object')) acc.push({ caminho, no })

  if (no.properties) {
    for (const [nome, filho] of Object.entries(no.properties)) {
      todosOsObjectos(filho, acc, `${caminho}.${nome}`)
    }
  }
  if (no.items) todosOsObjectos(no.items, acc, `${caminho}[]`)
  return acc
}

describe('os esquemas obedecem às regras do modo estrito', () => {
  for (const esquema of ESQUEMAS) {
    test(`${esquema.name}: todos os objectos recusam campos extra`, () => {
      // Sem additionalProperties: false, o fornecedor rejeita o esquema inteiro.
      const faltam = todosOsObjectos(esquema.schema)
        .filter(({ no }) => no.additionalProperties !== false)
        .map(({ caminho }) => caminho)
      assert.deepEqual(faltam, [])
    })

    test(`${esquema.name}: todos os campos estão em required`, () => {
      // Não há opcionais em modo estrito. Um campo declarado e ausente de
      // required faz o fornecedor recusar o esquema.
      const incompletos = todosOsObjectos(esquema.schema)
        .filter(({ no }) => {
          const declarados = Object.keys(no.properties ?? {})
          const exigidos = no.required ?? []
          return declarados.some((c) => !exigidos.includes(c))
        })
        .map(({ caminho }) => caminho)
      assert.deepEqual(incompletos, [])
    })

    test(`${esquema.name}: cabe no limite de 5000 caracteres`, () => {
      // A Cerebras impõe este limite. A Groq não o publica, mas um esquema que
      // cabe nos dois não obriga a pensar nisto ao trocar de fornecedor.
      const tamanho = JSON.stringify(esquema.schema).length
      assert.ok(tamanho < 5000, `${esquema.name} tem ${tamanho} caracteres`)
    })
  }
})

describe('o que os esquemas garantem à app', () => {
  test('o tipo de actividade só pode ser um dos cinco que a interface desenha', () => {
    // O mapa e o painel de despesas escolhem cor e ícone por este campo. Um
    // valor fora da lista dava um marcador sem cor e ninguém reportava.
    const actividade = ESQUEMA_DIAS.schema.properties.days.items.properties.activities.items
    assert.deepEqual(actividade.properties.type.enum, ['visit', 'food', 'transport', 'leisure', 'hotel'])
  })

  test('os campos que podem vir vazios aceitam null explicitamente', () => {
    // Em modo estrito não há opcionais: um campo que às vezes não se aplica
    // tem de dizer que aceita null, senão o modelo é obrigado a inventar um
    // valor. Uma morada inventada é pior do que uma morada em falta.
    const actividade = ESQUEMA_DIAS.schema.properties.days.items.properties.activities.items
    for (const campo of ['address', 'geoName', 'cost', 'tips']) {
      assert.ok(
        actividade.properties[campo].type.includes('null'),
        `${campo} devia aceitar null — senão o modelo inventa`,
      )
    }
  })

  test('o destino pode dizer que não conhece o sítio', () => {
    // normalizedName a null é como o agente responde "isto não é um lugar
    // real", e a rota de geração depende disso para recusar o pedido.
    assert.ok(ESQUEMA_DESTINO.schema.properties.normalizedName.type.includes('null'))
  })
})

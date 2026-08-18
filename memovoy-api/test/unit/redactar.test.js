import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { redactarCredenciais } from '../../src/app.js'

// O arranque regista o REDIS_URL nos logs. Esse URL tem o formato
// redis://[user]:[password]@host:porta — em bruto, punha a password no stdout e
// daí em qualquer agregador de logs. Estes testes existem para que a redacção
// não seja removida por distração.

describe('redactarCredenciais', () => {
  test('esconde a password mantendo host e porta legíveis', () => {
    const r = redactarCredenciais('redis://:segredo123@localhost:6379')

    assert.doesNotMatch(r, /segredo123/)
    assert.match(r, /localhost/)
    assert.match(r, /6379/)
  })

  test('esconde utilizador e password', () => {
    const r = redactarCredenciais('redis://admin:segredo@cache.exemplo.pt:6379/0')

    assert.doesNotMatch(r, /segredo/)
    assert.doesNotMatch(r, /admin/)
    assert.match(r, /cache\.exemplo\.pt/)
  })

  test('URL sem credenciais passa inalterado no essencial', () => {
    const r = redactarCredenciais('redis://localhost:6379')

    assert.match(r, /localhost:6379/)
    assert.doesNotMatch(r, /\*\*\*/, 'não inventa credenciais onde não há')
  })

  test('funciona com outros esquemas — postgres também tem password no URL', () => {
    const r = redactarCredenciais('postgresql://postgres:minhapass@localhost:5432/memovoy')

    assert.doesNotMatch(r, /minhapass/)
    assert.match(r, /5432/)
  })

  test('valor por definir não rebenta', () => {
    assert.equal(redactarCredenciais(undefined), '(vazio)')
    assert.equal(redactarCredenciais(''), '(vazio)')
  })

  test('URL malformado não é impresso em bruto', () => {
    // Se não faz parse, não dá para saber onde acaba a password — mais vale
    // não imprimir nada do que arriscar.
    const r = redactarCredenciais('redis//:segredo@sem-dois-pontos')

    assert.doesNotMatch(r, /segredo/)
    assert.equal(r, '(ilegível)')
  })

  test('nunca devolve undefined nem null', () => {
    for (const entrada of [undefined, null, '', 'x', 'redis://h:1']) {
      assert.equal(typeof redactarCredenciais(entrada), 'string')
    }
  })
})

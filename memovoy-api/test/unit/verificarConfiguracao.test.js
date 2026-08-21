import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { avaliar, verificarConfiguracao, relatarConfiguracao } from '../../src/lib/verificarConfiguracao.js'

// Estes casos não são inventados: são os valores reais que estavam no .env do
// projecto e que passaram meses sem ninguém dar por eles.

const VALIDO = {
  DATABASE_URL:       'postgresql://postgres:postgres@localhost:5432/memovoy',
  JWT_SECRET:         'um-segredo-suficientemente-longo-para-servir',
  JWT_REFRESH_SECRET: 'outro-segredo-suficientemente-longo-tambem',
  GROQ_API_KEY:       'gsk_' + 'a'.repeat(52),
  SMTP_HOST:          'smtp.gmail.com',
  SMTP_USER:          'alguem@gmail.com',
  SMTP_PASS:          'abcd efgh ijkl mnop',
}

describe('avaliar um valor', () => {
  test('uma chave da Groq com sete caracteres é suspeita', () => {
    // Era isto que lá estava: `gsk_` e mais nada. Uma verificação de presença
    // dá verde, e a app só falha quando alguém tenta gerar um roteiro.
    const r = avaliar({ nome: 'GROQ_API_KEY', minimo: 40, prefixo: 'gsk_' }, 'gsk_abc')
    assert.equal(r.estado, 'suspeita')
    assert.match(r.razao, /7 caracteres/)
  })

  test('uma chave da Groq verdadeira passa', () => {
    const r = avaliar({ nome: 'GROQ_API_KEY', minimo: 40, prefixo: 'gsk_' }, 'gsk_' + 'a'.repeat(52))
    assert.equal(r.estado, 'ok')
  })

  test('uma chave com o comprimento certo mas sem o prefixo é suspeita', () => {
    // Guarda contra passar só por ser comprida.
    const r = avaliar({ nome: 'GROQ_API_KEY', minimo: 40, prefixo: 'gsk_' }, 'x'.repeat(56))
    assert.equal(r.estado, 'suspeita')
    assert.match(r.razao, /gsk_/)
  })

  test('valores de exemplo são apanhados mesmo com o comprimento certo', () => {
    // O SMTP_USER era literalmente isto.
    for (const v of ['o-teu-email@example.com', 'coloca-aqui-a-tua-password', 'CHANGEME-please-now']) {
      assert.equal(avaliar({ nome: 'X', minimo: 3 }, v).estado, 'suspeita', v)
    }
  })

  test('vazio é ausente, não suspeito — são coisas diferentes', () => {
    assert.equal(avaliar({ nome: 'X' }, '').estado, 'ausente')
  })
})

describe('o relatório de arranque', () => {
  test('não deixa arrancar sem base de dados nem segredos', () => {
    for (const nome of ['DATABASE_URL', 'JWT_SECRET', 'JWT_REFRESH_SECRET']) {
      const ambiente = { ...VALIDO, [nome]: '' }
      assert.throws(() => relatarConfiguracao(ambiente, { warn() {} }), new RegExp(nome))
    }
  })

  test('um segredo de JWT curto de mais também trava o arranque', () => {
    // Presença não chega: 'x' é um segredo presente e inútil.
    assert.throws(
      () => relatarConfiguracao({ ...VALIDO, JWT_SECRET: 'x' }, { warn() {} }),
      /JWT_SECRET/,
    )
  })

  test('sem IA e sem email a app arranca, mas diz o que perde', () => {
    // A decisão: trinta e tal páginas não precisam de IA nem de email, e
    // recusar arrancar seria pior do que o problema.
    const avisos = []
    const ambiente = { ...VALIDO, GROQ_API_KEY: 'gsk_abc', SMTP_PASS: 'a-tua-password' }

    assert.doesNotThrow(() => relatarConfiguracao(ambiente, { warn: (m) => avisos.push(m) }))

    const texto = avisos.join('\n')
    assert.match(texto, /geração com IA/)
    assert.match(texto, /envio de email/)
    assert.match(texto, /GROQ_API_KEY/)
    assert.match(texto, /SMTP_PASS/)
  })

  test('com tudo bem preenchido não escreve nada', () => {
    // Um bloco verde em cada arranque ensina a saltar o bloco todo, e a linha
    // que interessa passa despercebida no meio dele.
    const avisos = []
    relatarConfiguracao(VALIDO, { warn: (m) => avisos.push(m) })
    assert.deepEqual(avisos, [])
  })

  test('agrupa por funcionalidade e não por variável', () => {
    // Quem lê quer saber "o email não funciona", não "faltam três variáveis".
    const avisos = []
    relatarConfiguracao(
      { ...VALIDO, SMTP_HOST: '', SMTP_USER: '', SMTP_PASS: '' },
      { warn: (m) => avisos.push(m) },
    )
    const linhasDeEmail = avisos.filter((l) => l.includes('envio de email'))
    assert.equal(linhasDeEmail.length, 1, 'as três variáveis deviam dar uma linha só')
  })
})

describe('o estado real do projecto', () => {
  test('verificarConfiguracao lê o ambiente que lhe derem', () => {
    const r = verificarConfiguracao({ ...VALIDO, GROQ_API_KEY: '' })
    const groq = r.find((x) => x.nome === 'GROQ_API_KEY')
    assert.equal(groq.estado, 'ausente')
    assert.equal(groq.obrigatoria, false, 'a IA não pode ser obrigatória para a app arrancar')
  })
})

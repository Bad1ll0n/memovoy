import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { resolverConfigLlm, tempoEstimadoMs, esforcoParaModelo, PERFIS } from '../../src/services/llmConfig.js'

// O fornecedor e os modelos estavam escritos no código. A 16 de Agosto de 2026
// a Groq desligou os dois modelos que a app usava — o principal e o de recurso,
// no mesmo dia — e a app ficou sem IA nenhuma até alguém editar um ficheiro.
//
// Um identificador de modelo é um valor que caduca.

describe('resolver o fornecedor', () => {
  test('sem configuração nenhuma usa a Groq com modelos vivos', () => {
    const c = resolverConfigLlm({})
    assert.equal(c.provider, 'groq')
    assert.equal(c.modelo, 'openai/gpt-oss-120b')
    assert.equal(c.recurso, 'openai/gpt-oss-20b')
  })

  test('nenhum dos modelos por omissão é um dos desligados', () => {
    // Guarda directa contra o que aconteceu. Se alguém repuser um destes por
    // conveniência, o teste diz porquê.
    const desligados = ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant']
    for (const perfil of Object.values(PERFIS)) {
      for (const m of [perfil.modelo, perfil.recurso, perfil.visao]) {
        assert.ok(!desligados.includes(m), `${m} foi desligado a 2026-08-16`)
      }
    }
  })

  test('escolher a DeepSeek muda endpoint, modelos e paciência', () => {
    const c = resolverConfigLlm({ LLM_PROVIDER: 'deepseek' })
    assert.equal(c.baseURL, 'https://api.deepseek.com/v1')
    assert.equal(c.modelo, 'deepseek-v4-flash')
    assert.ok(c.timeoutMs > 100_000, 'a DeepSeek é lenta e precisa de muito mais tempo')
  })

  test('uma variável explícita ganha ao perfil', () => {
    // Para usar o modelo da DeepSeek num fornecedor mais rápido, por exemplo.
    const c = resolverConfigLlm({ LLM_PROVIDER: 'deepseek', LLM_BASE_URL: 'https://outro.exemplo/v1' })
    assert.equal(c.baseURL, 'https://outro.exemplo/v1')
    assert.equal(c.modelo, 'deepseek-v4-flash', 'o resto do perfil mantém-se')
  })

  test('um perfil desconhecido cai na Groq em vez de rebentar', () => {
    const c = resolverConfigLlm({ LLM_PROVIDER: 'inexistente' })
    assert.equal(c.provider, 'groq')
  })

  test('o nome antigo da chave continua a servir', () => {
    assert.equal(resolverConfigLlm({ GROQ_API_KEY: 'gsk_abc' }).apiKey, 'gsk_abc')
    // e o novo ganha quando os dois existem
    assert.equal(resolverConfigLlm({ GROQ_API_KEY: 'antigo', LLM_API_KEY: 'novo' }).apiKey, 'novo')
  })

  test('um LLM_TIMEOUT_MS inválido não deixa a app sem tempo limite', () => {
    for (const mau of ['abc', '0', '-5', '']) {
      const c = resolverConfigLlm({ LLM_TIMEOUT_MS: mau })
      assert.equal(c.timeoutMs, PERFIS.groq.timeoutMs, `"${mau}" devia cair na omissão`)
    }
  })
})

describe('o mesmo modelo noutro fornecedor', () => {
  test('a Cerebras corre exactamente o mesmo modelo que a Groq', () => {
    // Este é o ponto todo: não é uma troca de modelo, são os mesmos pesos
    // noutro hardware. A qualidade é idêntica por construção, e o ganho de
    // velocidade não custa precisão nenhuma.
    assert.equal(
      PERFIS.cerebras.modelo.replace(/^openai\//, ''),
      PERFIS.groq.modelo.replace(/^openai\//, ''),
    )
  })

  test('e por isso pode ter um limite muito mais curto', () => {
    assert.ok(PERFIS.cerebras.timeoutMs < PERFIS.groq.timeoutMs)
  })
})

describe('o tempo limite tem de caber no que se pede', () => {
  // O agente que gera os dias pede 7000 tokens de saída. É este número que
  // decide se um fornecedor serve, e não a opinião de ninguém.
  const TOKENS_DO_PEDIDO_MAIS_PESADO = 7000

  test('a 500 t/s da Groq, 25 segundos chegam', () => {
    const preciso = tempoEstimadoMs(TOKENS_DO_PEDIDO_MAIS_PESADO, 500)
    assert.ok(preciso < PERFIS.groq.timeoutMs, `precisa de ${preciso}ms e tem ${PERFIS.groq.timeoutMs}ms`)
  })

  test('à velocidade MEDIDA da Cerebras, 20 segundos sobram', () => {
    // 1641 t/s, medidos por terceiros. Usei primeiro os 3000 que a Cerebras
    // anuncia — quase o dobro do real. Para velocidade, o número do fornecedor
    // é um tecto e não uma expectativa, por isso o teste usa o medido.
    const preciso = tempoEstimadoMs(TOKENS_DO_PEDIDO_MAIS_PESADO, 1641)
    assert.ok(preciso < 5_000, `~${preciso}ms`)
    assert.ok(preciso * 4 < PERFIS.cerebras.timeoutMs, 'o limite deve ter margem larga sobre a estimativa')
  })

  test('mesmo assim é três vezes mais rápida que a Groq', () => {
    const cerebras = tempoEstimadoMs(TOKENS_DO_PEDIDO_MAIS_PESADO, 1641)
    const groq     = tempoEstimadoMs(TOKENS_DO_PEDIDO_MAIS_PESADO, 474)
    assert.ok(groq / cerebras > 3)
  })

  test('o plano gratuito da Cerebras deixa uma folga perigosamente pequena', () => {
    // Escrevi primeiro que não cabia, e o teste desmentiu-me: 7000 de saída
    // mais ~1000 de entrada dão 8000 contra 8192 de contexto. CABE — com 192
    // tokens de folga, que é praticamente nada.
    //
    // O prompt cresce com o destino, os estilos de viagem e as preferências
    // guardadas do utilizador. Basta um pedido um pouco mais rico para
    // rebentar, e o erro que sai é de contexto, que não diz nada a quem o vê.
    // O plano pago dá 131k e o problema desaparece.
    const entradaTipica = 1000
    const folga = PERFIS.cerebras.contextoNoPlanoGratuito - (TOKENS_DO_PEDIDO_MAIS_PESADO + entradaTipica)

    assert.ok(folga > 0, 'com uma entrada típica ainda cabe')
    assert.ok(folga < 500, `só ${folga} tokens de folga — o plano gratuito não serve para produção`)
  })

  test('a 83 t/s da DeepSeek, 25 segundos NÃO chegam', () => {
    // ~84 segundos. Com o limite antigo, gerar um roteiro falharia sempre —
    // não às vezes, sempre. Foi por isso que o perfil da DeepSeek subiu o tempo.
    const preciso = tempoEstimadoMs(TOKENS_DO_PEDIDO_MAIS_PESADO, 83)
    assert.ok(preciso > 25_000, 'este é o cálculo que desaconselha o limite antigo')
    assert.ok(preciso < PERFIS.deepseek.timeoutMs, `precisa de ${preciso}ms e o perfil dá ${PERFIS.deepseek.timeoutMs}ms`)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// O raciocínio come o orçamento do texto
//
// Descobri isto a testar uma chave nova: pedi uma legenda com max_tokens 10 e
// veio uma string vazia. Não um erro — vazia. Os 10 tokens foram todos para o
// raciocínio e não sobrou nenhum para a resposta.
//
// Com os 300 que o código usava, medido contra a API a sério:
//
//     Edimburgo   139 a pensar   190 de 300 no total
//     Tóquio      182            251
//     Lisboa      230            291       ← nove tokens de folga
//
// E quando não sobra, o modelo é interrompido a meio da frase e o campo vem
// preenchido na mesma. Forcei o corte para ver: "...ouvindo um fado que".
// Escrever até ao limite é indistinguível de escrever até ao fim, se ninguém
// olhar para o finish_reason.
describe('o esforço de raciocínio por modelo', () => {
  test('os dois modelos usam vocabulários que não se tocam', () => {
    // Esta é a razão de o valor viver no perfil e não no sítio da chamada.
    // Medido contra a API: o gpt-oss responde 400 a `none` ("must be one of
    // low, medium, or high") e o qwen responde 400 a `low` ("must be one of
    // none or default"). Um valor fixo parte um dos dois caminhos.
    const cfg = resolverConfigLlm({ LLM_PROVIDER: 'groq' })

    assert.equal(esforcoParaModelo(cfg, 'openai/gpt-oss-120b'), 'low')
    assert.equal(esforcoParaModelo(cfg, 'qwen/qwen3.6-27b'), 'none')
    assert.notEqual(
      esforcoParaModelo(cfg, 'openai/gpt-oss-120b'),
      esforcoParaModelo(cfg, 'qwen/qwen3.6-27b'),
      'se algum dia forem iguais, alguém simplificou isto sem testar os dois',
    )
  })

  test('um modelo desconhecido não leva parâmetro nenhum', () => {
    // Deliberado. Enviar o parâmetro errado dá 400 e mata a chamada; não o
    // enviar só gasta mais alguns tokens a pensar. Perante a dúvida, a opção
    // cara ganha a opção partida.
    const cfg = resolverConfigLlm({ LLM_PROVIDER: 'groq' })
    assert.equal(esforcoParaModelo(cfg, 'modelo-que-ainda-nao-existe'), undefined)
  })

  test('o modelo de visão da Groq não é o que foi desligado', () => {
    // O llama-4-scout respondia 404 e ninguém tinha reparado: a única coisa
    // que o usava eram as legendas com foto, longe da geração de roteiros.
    // Um modelo de visão morto falha num canto da app que ninguém visita.
    assert.ok(!/llama-4-scout/.test(PERFIS.groq.visao), 'o modelo desligado voltou ao perfil')
    assert.ok(PERFIS.groq.visao, 'tem de haver um modelo de visão')
  })

  test('todo o modelo nomeado no perfil da Groq sabe que esforço aceita', () => {
    // Um modelo no perfil sem entrada aqui é um 400 à espera de acontecer,
    // ou tokens desperdiçados em silêncio. Vale para os que existem hoje e
    // para o próximo que alguém acrescentar.
    const perfil = PERFIS.groq
    for (const modelo of [perfil.modelo, perfil.recurso, perfil.visao]) {
      assert.ok(
        perfil.esforcoMinimo[modelo],
        `${modelo} está no perfil mas não diz que esforço aceita`,
      )
    }
  })
})

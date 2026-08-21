/**
 * Que modelo, de que fornecedor, com que paciência.
 *
 * Isto estava escrito no código: um baseURL da Groq e dois identificadores de
 * modelo em constantes. Trocar de fornecedor era um commit, e comparar dois era
 * impossível sem editar ficheiros.
 *
 * Não é uma preocupação teórica. A 16 de Agosto de 2026 a Groq desligou os dois
 * modelos que a app usava — o principal e o de recurso, no mesmo dia. Um
 * identificador de modelo é um valor que caduca, e valores que caducam não
 * pertencem ao código-fonte.
 *
 * Agora vem do ambiente, com omissões que funcionam sem configuração nenhuma.
 *
 * ── Sobre o tempo limite ────────────────────────────────────────────────────
 *
 * O limite não é um número escolhido a olho: é uma consequência do débito do
 * fornecedor e do tamanho da resposta. O agente que gera os dias pede 7000
 * tokens de saída, portanto
 *
 *     tempo ≈ 7000 ÷ (tokens por segundo do fornecedor)
 *
 * A ~500 t/s (Groq) são uns 14 segundos e 25 chegam bem. A ~83 t/s (API da
 * DeepSeek) são uns 84 segundos, e com 25 falha sempre — não às vezes, sempre.
 * Por isso o limite acompanha o fornecedor em vez de ser fixo.
 */

/** Perfis conhecidos. Servem de atalho e de documentação do que foi medido. */
export const PERFIS = {
  groq: {
    baseURL:  'https://api.groq.com/openai/v1',
    modelo:   'openai/gpt-oss-120b',
    recurso:  'openai/gpt-oss-20b',
    visao:    'meta-llama/llama-4-scout-17b-16e-instruct',
    // ~500 tokens/s medidos pela Groq para o gpt-oss-120b.
    timeoutMs: 25_000,
    prefixoDaChave: 'gsk_',
  },
  cerebras: {
    baseURL:  'https://api.cerebras.ai/v1',
    // O MESMO modelo que o perfil da Groq. Não é uma troca de modelo: são os
    // mesmos pesos noutro hardware. Por isso a qualidade é idêntica por
    // construção — não há nada a testar nem a arriscar do lado da precisão.
    modelo:   'gpt-oss-120b',
    recurso:  'gemma-4-31b',
    visao:    'gpt-oss-120b',
    // ~1641 tokens/s medidos de forma independente pela Artificial Analysis.
    //
    // Escrevi aqui 3000 primeiro, que é o número da própria Cerebras. Medido
    // por terceiros dá 1641 — continua a ser de longe o mais rápido (a Groq faz
    // 474), mas quase metade do anunciado. Vale a regra: para velocidade, o
    // número do fornecedor é um tecto, não uma expectativa.
    //
    // 7000 tokens dão ~4,3 segundos, contra ~15 na Groq e ~84 na DeepSeek.
    // 20s é quase cinco vezes a estimativa, o que chega para o TTFT e a rede.
    timeoutMs: 20_000,
    prefixoDaChave: 'csk-',
    // AVISO: o plano gratuito limita o contexto a 8192 tokens. O agente que
    // gera os dias pede 7000 de saída e o prompt anda pelos 1000 — dá 8000, e
    // portanto cabe, mas com 192 tokens de folga. O prompt cresce com o
    // destino, os estilos e as preferências guardadas, por isso um pedido um
    // pouco mais rico rebenta, com um erro de contexto que não diz nada a quem
    // o vê. Para uso a sério, plano pago: 131k.
    contextoNoPlanoGratuito: 8_192,
  },
  deepseek: {
    baseURL:  'https://api.deepseek.com/v1',
    modelo:   'deepseek-v4-flash',
    recurso:  'deepseek-v4-flash',
    visao:    'deepseek-v4-flash-vision-exp',
    // ~83 tokens/s na API própria da DeepSeek. 7000 tokens dão uns 84s, por
    // isso o limite tem de subir muito acima dos 25s da Groq — senão o agente
    // que gera os dias falha em todas as tentativas.
    timeoutMs: 150_000,
    prefixoDaChave: 'sk-',
  },
}

/**
 * Resolve a configuração a partir do ambiente.
 *
 * Ordem: variável explícita > perfil escolhido > perfil por omissão. Assim dá
 * para usar um perfil e ajustar só uma peça — por exemplo, o mesmo modelo da
 * DeepSeek num fornecedor mais rápido, mudando só o baseURL.
 *
 * A chave aceita LLM_API_KEY ou GROQ_API_KEY. O nome antigo continua a
 * funcionar para não partir instalações existentes; o novo é o que se deve
 * usar agora que o fornecedor deixou de estar preso.
 */
export function resolverConfigLlm(ambiente = process.env) {
  const nomeDoPerfil = (ambiente.LLM_PROVIDER ?? 'groq').toLowerCase()
  const perfil = PERFIS[nomeDoPerfil] ?? PERFIS.groq

  const numero = (v, omissao) => {
    const n = Number(v)
    return Number.isFinite(n) && n > 0 ? n : omissao
  }

  return {
    provider:  nomeDoPerfil in PERFIS ? nomeDoPerfil : 'groq',
    baseURL:   ambiente.LLM_BASE_URL       || perfil.baseURL,
    apiKey:    ambiente.LLM_API_KEY        || ambiente.GROQ_API_KEY || '',
    modelo:    ambiente.LLM_MODEL          || perfil.modelo,
    recurso:   ambiente.LLM_MODEL_FALLBACK || perfil.recurso,
    visao:     ambiente.LLM_MODEL_VISION   || perfil.visao,
    timeoutMs: numero(ambiente.LLM_TIMEOUT_MS, perfil.timeoutMs),
    prefixoDaChave: perfil.prefixoDaChave,
  }
}

/**
 * Avisa quando o tempo limite não chega para o que se vai pedir.
 *
 * Prefiro isto a subir o limite sozinho: o número certo depende do fornecedor
 * real, e adivinhar por baixo dá falhas em todas as gerações enquanto adivinhar
 * por cima deixa o utilizador à espera de um erro que já se sabe que vem.
 *
 * @param {number} tokensDeSaida  o pedido mais pesado que a app faz
 * @param {number} tokensPorSegundo  débito observado do fornecedor
 */
export function tempoEstimadoMs(tokensDeSaida, tokensPorSegundo) {
  return Math.round((tokensDeSaida / tokensPorSegundo) * 1000)
}

/**
 * Esquemas para descodificação restringida.
 *
 * O modo `json_object` garante JSON *válido*, não JSON com a forma certa. A
 * diferença deixou de ser teórica: com o gpt-oss-120b, a primeira geração de um
 * roteiro falhou com «400 Failed to generate JSON» e a segunda, com o mesmo
 * pedido, passou. É um modelo de raciocínio e às vezes não fecha o objecto.
 *
 * O `json_schema` com `strict: true` resolve isto de outra maneira: o esquema
 * passa a ser imposto ao nível do token durante a geração, portanto o modelo
 * não *pode* produzir algo que não encaixe. Não é o prompt a pedir com jeitinho
 * — é a descodificação a não deixar sair outra coisa.
 *
 * De caminho torna o repararDias() redundante. Deixei-o na mesma: continua a
 * servir os fornecedores que não suportam esquema estrito, e apagar uma rede de
 * segurança no mesmo dia em que se instala outra é apressado.
 *
 * ── Regras do modo estrito ───────────────────────────────────────────────────
 *
 * Não é JSON Schema completo. Os fornecedores impõem um subconjunto:
 *
 *   - todos os campos têm de estar em `required` (não há opcionais)
 *   - todos os objectos precisam de `additionalProperties: false`
 *   - um campo que pode vir vazio declara-se como união com "null"
 *   - a Cerebras limita a 5000 caracteres de esquema, 10 níveis, 500 campos
 *
 * A primeira regra é a que mais custa: como não há opcionais, um campo que às
 * vezes não se aplica tem de aceitar null explicitamente.
 */

/** Uma actividade dentro de um dia. É o objecto mais aninhado que temos. */
const ACTIVIDADE = {
  type: 'object',
  additionalProperties: false,
  required: ['time', 'durationMin', 'name', 'description', 'address', 'geoName', 'cost', 'currency', 'type', 'tips'],
  properties: {
    time:        { type: 'string' },
    // ── Quanto tempo demora ─────────────────────────────────────────────────
    //
    // Sem isto, um dia era uma lista de horas de início e mais nada. Ninguém
    // conseguia ver que entre uma igreja de bairro (meia hora) e o almoço três
    // horas depois havia duas horas e meia sem nada — nem o modelo, nem a
    // interface, nem quem estava a rever.
    //
    // Medido num roteiro de sete dias em Roma: quatro entradas por dia, duas
    // delas refeições, e cerca de seis horas por dia dentro da janela pedida
    // sem nada marcado. A contagem de actividades estava cumprida; o dia é que
    // estava a meio.
    //
    // Em minutos, e obrigatório. Um número verifica-se — "uma manhã" não.
    durationMin: { type: 'integer' },
    name:        { type: 'string' },
    description: { type: 'string' },
    // Estes quatro vêm a null com frequência — morada desconhecida, actividade
    // gratuita, sem dica. Em modo estrito isso tem de ser declarado.
    address:     { type: ['string', 'null'] },
    geoName:     { type: ['string', 'null'] },
    cost:        { type: ['number', 'null'] },
    tips:        { type: ['string', 'null'] },
    currency:    { type: 'string' },
    // O enum é o que garante que o mapa e o painel de despesas recebem sempre
    // um tipo que sabem desenhar. Era a fonte mais provável de lixo silencioso.
    type:        { type: 'string', enum: ['visit', 'food', 'transport', 'leisure', 'hotel'] },
  },
}

export const ESQUEMA_DESTINO = {
  name: 'destino_validado',
  schema: {
    type: 'object',
    additionalProperties: false,
    required: ['normalizedName', 'country', 'continent', 'currency', 'language', 'timezone', 'bestTimeToVisit', 'quickFacts'],
    properties: {
      // null quando o destino não é um sítio real — é assim que o agente diz
      // "não reconheço isto", e a app depende disso.
      normalizedName:  { type: ['string', 'null'] },
      country:         { type: ['string', 'null'] },
      continent:       { type: ['string', 'null'] },
      currency:        { type: ['string', 'null'] },
      language:        { type: ['string', 'null'] },
      timezone:        { type: ['string', 'null'] },
      bestTimeToVisit: { type: ['string', 'null'] },
      quickFacts:      { type: 'array', items: { type: 'string' } },
    },
  },
}

export const ESQUEMA_DIAS = {
  name: 'roteiro_por_dias',
  schema: {
    type: 'object',
    additionalProperties: false,
    required: ['summary', 'totalEstimatedCost', 'days'],
    properties: {
      summary:            { type: 'string' },
      totalEstimatedCost: { type: 'string' },
      days: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['day', 'date', 'theme', 'activities'],
          properties: {
            day:        { type: 'number' },
            date:       { type: 'string' },
            theme:      { type: 'string' },
            activities: { type: 'array', items: ACTIVIDADE },
          },
        },
      },
    },
  },
}

export const ESQUEMA_DICAS = {
  name: 'dicas_locais',
  schema: {
    type: 'object',
    additionalProperties: false,
    required: ['safetyTips', 'transportTips', 'budgetHacks', 'mustTry', 'avoid', 'localPhrases'],
    properties: {
      safetyTips:    { type: 'array', items: { type: 'string' } },
      transportTips: { type: 'array', items: { type: 'string' } },
      budgetHacks:   { type: 'array', items: { type: 'string' } },
      mustTry:       { type: 'array', items: { type: 'string' } },
      avoid:         { type: 'array', items: { type: 'string' } },
      localPhrases: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['local', 'translation'],
          properties: {
            local:       { type: 'string' },
            translation: { type: 'string' },
          },
        },
      },
    },
  },
}

/** Todos, para os testes poderem varrê-los sem os enumerar à mão. */
export const ESQUEMAS = [ESQUEMA_DESTINO, ESQUEMA_DIAS, ESQUEMA_DICAS]

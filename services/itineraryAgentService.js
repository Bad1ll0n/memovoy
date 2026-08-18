// services/itineraryAgentService.js
// Agente IA que gera roteiros usando OpenAI GPT-4o-mini
// npm install openai

const OpenAI = require('openai');

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const MODEL  = 'gpt-4o-mini'; // mais barato que o gpt-4o, suficiente para JSON

/* ── Helper: chama o OpenAI e devolve texto ── */
async function ask(prompt, maxTokens = 4096) {
    const res = await client.chat.completions.create({
        model:      MODEL,
        max_tokens: maxTokens,
        messages: [
            { role: 'system', content: 'Responde APENAS com JSON válido, sem markdown, sem texto extra.' },
            { role: 'user',   content: prompt },
        ],
    });

    const choice = res.choices[0];
    if (choice.finish_reason === 'length') {
        throw new Error('Resposta da IA foi cortada (token limit). Tenta com menos dias ou reduz as preferências.');
    }

    return choice.message.content;
}

/* ── Helper: parse JSON seguro ── */
function parseJSON(raw) {
    // Remove blocos markdown caso o modelo os devolva (```json ... ```)
    const cleaned = raw.replace(/```(?:json)?\s*/gi, '').replace(/```\s*/g, '').trim();
    const match = cleaned.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
    if (!match) throw new Error('Resposta da IA não contém JSON válido: ' + raw.slice(0, 200));
    try {
        return JSON.parse(match[1]);
    } catch (e) {
        throw new Error(`JSON inválido da IA: ${e.message} — excerto: ...${match[1].slice(Math.max(0, e.message.match(/\d+/)?.[0] - 40), (e.message.match(/\d+/)?.[0] ?? 0) + 40)}...`);
    }
}

/* ── Helper: número de dias ── */
function calcDays(departure, returnDate) {
    const ms = new Date(returnDate) - new Date(departure);
    return Math.max(1, Math.round(ms / (1000 * 60 * 60 * 24)));
}


/* ════════════════════════════════════════════
   Ferramenta 1 — Validar e enriquecer destino
   ════════════════════════════════════════════ */
async function agentValidateDestination(destination) {
    const raw = await ask(`Valida e enriquece este destino de viagem: "${destination}".
Devolve este JSON exato:
{
  "valid": true,
  "normalizedName": "Nome oficial da cidade",
  "country": "Pais",
  "continent": "Continente",
  "bestTimeToVisit": "Epoca ideal",
  "currency": "Moeda local",
  "language": "Lingua principal",
  "timezone": "Fuso horario (ex: UTC+1)",
  "quickFacts": ["facto curioso 1", "facto curioso 2", "facto curioso 3"]
}`);
    return parseJSON(raw);
}


/* ════════════════════════════════════════════
   Ferramenta 2 — Gerar itinerário dia a dia
   ════════════════════════════════════════════ */
async function agentGenerateDays(params, destinationInfo) {
    const { departureDate, returnDate, styles, group, budget, extras, dayStart, dayEnd, meals, transport } = params;
    const numDays = calcDays(departureDate, returnDate);

    const mealsLabel = meals === 'nenhuma' ? 'nenhuma (não incluir refeições no roteiro)' : meals === 'almoco' ? 'apenas almoço' : meals === 'jantar' ? 'apenas jantar' : 'almoço e jantar';
    const transportLabel = transport === 'pe' ? 'a pé (prioriza locais próximos, sem transportes)' : transport === 'transporte' ? 'transportes públicos (metro, autocarro, etc.)' : 'carro (inclui estacionamento, sem limitações de distância)';

    const raw = await ask(`Cria um roteiro de viagem para ${destinationInfo.normalizedName}, ${destinationInfo.country}.

CONTEXTO:
- Datas: ${departureDate} ate ${returnDate} (${numDays} dias)
- Estilos: ${styles.length > 0 ? styles.join(', ') : 'geral'}
- Grupo: ${group}
- Orcamento: ${budget} EUR/dia por pessoa
- Horario do dia: começa as ${dayStart} e termina as ${dayEnd}
- Refeicoes a incluir: ${mealsLabel}
- Modo de deslocacao: ${transportLabel}
- Preferencias extra: ${extras.length > 0 ? extras.join(', ') : 'nenhuma'}

Devolve este JSON com exatamente ${numDays} dias:
{
  "title": "Titulo criativo do roteiro",
  "summary": "Resumo apelativo de 2 frases",
  "days": [
    {
      "dayNumber": 1,
      "date": "YYYY-MM-DD",
      "title": "Titulo do dia",
      "theme": "Tema do dia (ex: Cultura e Historia)",
      "highlight": "Momento especial do dia",
      "totalDayCost": "120 EUR",
      "activities": [
        {
          "time": "09:00",
          "name": "Nome do local ou atividade em portugues",
          "geoName": "Nome em ingles ou nome local oficial para geocodificacao (ex: Forbidden City, Jingshan Park, Wuhou Shrine)",
          "type": "visita",
          "description": "Descricao clara em 1-2 frases",
          "duration": "2 horas",
          "estimatedCost": "Gratis",
          "tip": "Dica pratica para aproveitar melhor",
          "neighborhood": "Bairro ou zona onde se localiza"
        }
      ]
    }
  ],
  "totalEstimatedCost": "XXX EUR",
  "packingTips": ["item essencial 1", "item essencial 2", "item essencial 3"],
  "localPhrases": [
    { "phrase": "Obrigado em portugues", "translation": "Expressao local", "pronunciation": "Como pronunciar" }
  ]
}

REGRAS OBRIGATORIAS — segue todas sem exceção:

PROXIMIDADE GEOGRAFICA:
- Dentro de cada dia, agrupa as atividades por zona/bairro para minimizar deslocacoes
- Ordena as atividades de forma a que cada uma seja proxima da anterior (percurso logico)
- Se houver mudanca de zona no mesmo dia, adiciona uma atividade de tipo "transporte" com o tempo estimado de deslocacao
- Nunca coloca dois locais opostos da cidade consecutivamente sem transporte entre eles

POPULARIDADE:
- Prioriza sempre os locais mais emblematicos, conhecidos e bem avaliados de ${destinationInfo.normalizedName}
- Inclui obrigatoriamente os top 3 pontos de interesse mais famosos da cidade ao longo do roteiro
- Para refeicoes, sugere restaurantes ou zonas gastronomicas icónicas e reconhecidas
- Evita sugerir locais genericoos ou desconhecidos quando existem alternativas populares

QUALIDADE GERAL:
- O campo "type" deve ser um de: visita, refeicao, transporte, lazer, alojamento
- Minimo 4 atividades por dia (excluindo transportes)
- Horarios realistas — a primeira atividade começa as ${dayStart} e a ultima termina ate as ${dayEnd}
- Inclui exatamente as refeicoes indicadas: ${mealsLabel}. Nao adicionar refeicoes nao pedidas
- Modo de deslocacao e ${transportLabel} — adapta as atividades e as distancias a este modo
- Se o modo for "a pe", agrupa atividades muito proximas e nao sugiras locais a mais de 2km de distancia consecutiva
- Se o modo for "carro", podes incluir locais mais distantes e menciona estacionamento nas dicas
- Se o modo for "transportes publicos", adiciona atividades de tipo transporte entre zonas distantes
- Distribui os pontos mais famosos ao longo dos varios dias, nao os concentres todos no mesmo dia`, 12000);

    return parseJSON(raw);
}


/* ════════════════════════════════════════════
   Ferramenta 3 — Gerar dicas extras
   ════════════════════════════════════════════ */
async function agentGenerateTips(destinationInfo, group, budget) {
    const raw = await ask(`Dicas de viagem para ${destinationInfo.normalizedName}, ${destinationInfo.country}.
Grupo: ${group}. Orcamento: ${budget} EUR/dia.

Devolve este JSON:
{
  "safetyTips":    ["dica de seguranca 1", "dica de seguranca 2"],
  "transportTips": ["dica de transporte 1", "dica de transporte 2"],
  "budgetHacks":   ["forma de poupar 1", "forma de poupar 2"],
  "mustTry":       ["experiencia obrigatoria 1", "experiencia obrigatoria 2", "experiencia obrigatoria 3"],
  "avoid":         ["coisa a evitar 1", "coisa a evitar 2"]
}`);
    return parseJSON(raw);
}


/* ════════════════════════════════════════════
   Função principal — orquestra os 3 agentes
   ════════════════════════════════════════════ */
async function runItineraryAgent(params) {
    console.log('[Agent] A iniciar para:', params.destination);

    console.log('[Agent] Step 1/3 — Validando destino...');
    const destinationInfo = await agentValidateDestination(params.destination);
    if (!destinationInfo.valid) {
        throw new Error(`Destino nao reconhecido: ${params.destination}`);
    }

    console.log('[Agent] Step 2/3 — Gerando itinerario...');
    const itinerary = await agentGenerateDays(params, destinationInfo);

    console.log('[Agent] Step 3/3 — Gerando dicas extras...');
    const tips = await agentGenerateTips(destinationInfo, params.group, params.budget);

    console.log('[Agent] Concluido!');
    return {
        ...itinerary,
        destinationInfo,
        extraTips:   tips,
        generatedAt: new Date().toISOString(),
        params,
    };
}

/* ════════════════════════════════════════════
   Ferramenta 4 — Sugerir alternativas para uma atividade
   ════════════════════════════════════════════ */
async function suggestAlternatives(activity, destinationInfo, params) {
    const raw = await ask(`Sugere 3 alternativas para esta atividade num roteiro em ${destinationInfo.normalizedName}, ${destinationInfo.country}.

ATIVIDADE ATUAL:
- Nome: ${activity.name}
- Tipo: ${activity.type}
- Hora: ${activity.time}
- Duração: ${activity.duration}

CONTEXTO DO ROTEIRO:
- Estilos: ${params.styles.join(', ') || 'geral'}
- Grupo: ${params.group}
- Orçamento: ${params.budget} EUR/dia
- Extras: ${params.extras.join(', ') || 'nenhum'}

Devolve este JSON com exatamente 3 alternativas diferentes entre si:
{
  "alternatives": [
    {
      "time": "${activity.time}",
      "name": "Nome da alternativa",
      "type": "${activity.type}",
      "description": "Descricao clara em 1-2 frases",
      "duration": "${activity.duration}",
      "estimatedCost": "XX EUR",
      "tip": "Dica pratica",
      "whyThisOne": "Frase curta a explicar porque esta opcao e boa"
    }
  ]
}

Regras:
- As 3 alternativas devem ser diferentes entre si e diferentes da atividade atual
- Usa locais reais e especificos de ${destinationInfo.normalizedName}
- O campo "type" deve ser um de: visita, refeicao, transporte, lazer, alojamento
- Mantém o mesmo horario e duracao aproximada`);

    return parseJSON(raw);
}

/* ════════════════════════════════════════════
   Ferramenta 5 — Sugerir atividades para roteiro manual
   ════════════════════════════════════════════ */
async function suggestActivitiesForDay(destination, date, dayNumber, existingActivities = []) {
    const existing = existingActivities.map(a => a.name).join(', ') || 'nenhuma ainda';

    const raw = await ask(`Sugere 6 atividades variadas para um dia em ${destination}.

DIA: ${date} (Dia ${dayNumber} do roteiro)
Atividades já adicionadas (evita repetir): ${existing}

Devolve este JSON com exatamente 6 sugestões variadas (visitas, refeições, lazer):
{
  "suggestions": [
    {
      "name": "Nome do local ou atividade",
      "type": "visita",
      "description": "Descrição curta em 1 frase",
      "suggestedTime": "09:00",
      "suggestedDuration": "2 horas",
      "estimatedCost": "Gratis",
      "tip": "Dica rápida"
    }
  ]
}

Regras:
- Varia os tipos: inclui pelo menos 1 refeicao, 1 visita, 1 lazer
- O campo "type" deve ser: visita, refeicao, transporte, lazer, ou alojamento
- Usa locais reais e específicos de ${destination}
- Sugere horários realistas ao longo do dia`);

    return parseJSON(raw);
}

/* ════════════════════════════════════════════
   Ferramenta 6 — Pesquisa livre de atividades
   ════════════════════════════════════════════ */
async function searchActivity(query, destination) {
    const raw = await ask(`O utilizador pesquisou "${query}" para o seu roteiro em ${destination}.

Devolve informação sobre esta atividade/local em JSON:
{
  "found": true,
  "name": "Nome oficial do local",
  "type": "visita",
  "description": "Descrição clara em 1-2 frases",
  "suggestedTime": "10:00",
  "suggestedDuration": "2 horas",
  "estimatedCost": "XX EUR ou Gratis",
  "tip": "Dica prática útil"
}

Se não reconheceres o local, devolve: { "found": false }
O campo "type" deve ser: visita, refeicao, transporte, lazer, ou alojamento`);

    return parseJSON(raw);
}

/* ════════════════════════════════════════════
   Guardar roteiro manual (mesmo formato do automático)
   ════════════════════════════════════════════ */
function buildManualItinerary(params, days) {
    return {
        title:              `Roteiro em ${params.destination}`,
        summary:            `Roteiro manual criado para ${params.destination} de ${params.departureDate} a ${params.returnDate}.`,
        days,
        destinationInfo: {
            normalizedName:  params.destination,
            country:         params.country || params.destination,
            currency:        '—',
            language:        '—',
            timezone:        '—',
            bestTimeToVisit: '—',
            quickFacts:      [],
        },
        extraTips:          null,
        packingTips:        [],
        localPhrases:       [],
        totalEstimatedCost: '—',
        generatedAt:        new Date().toISOString(),
        isManual:           true,
        params,
    };
}

module.exports = {
    runItineraryAgent,
    suggestAlternatives,
    suggestActivitiesForDay,
    searchActivity,
    buildManualItinerary,
};
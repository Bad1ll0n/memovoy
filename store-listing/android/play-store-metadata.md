# Google Play Console — Metadata MemoVoy

Preencher na ficha da loja (Store Listing) do Google Play Console.
Google Play distingue claramente entre PT e BR como locales separados
(`pt-PT` e `pt-BR`), ao contrário da App Store que trata "Português" como
uma única localização base.

---

## Informação geral

| Campo | Valor |
|---|---|
| Nome da app | MemoVoy |
| Package name | com.memovoy.app |
| Categoria | Viagens e local |
| Categoria de conteúdo | Tudo, com aviso de interacção social online |
| Contém anúncios | Não |
| Compras na app | Não (v1.0) |

---

## Locale: pt-PT (Português — Portugal)

### Título (30 caracteres máx.)
```
MemoVoy: Roteiros de Viagem
```

### Descrição curta (80 caracteres máx.)
```
Cria roteiros com IA, partilha viagens e descobre destinos reais.
```

### Descrição completa (4000 caracteres máx.)
```
MemoVoy é a rede social de viagens onde cada roteiro conta uma história.

✈️ CRIA ROTEIROS EM MINUTOS
O assistente de IA do MemoVoy gera um roteiro completo — destino, dias, actividades e orçamento estimado — a partir de algumas perguntas simples. Prefere fazer manualmente? Também podes construir o teu roteiro dia a dia, com total controlo.

📸 PARTILHA A TUA VIAGEM
Publica fotos ligadas directamente ao teu roteiro. Quem te segue vê não só a imagem, mas o contexto completo: onde foi, quando foi, o que fizeste.

🔍 DESCOBRE DESTINOS REAIS
Explora roteiros publicados por outros viajantes de Portugal e do Brasil. Filtra por país, duração da viagem, tipo de grupo (solo, casal, família, amigos) ou estilo.

🏆 GAMIFICAÇÃO COM SENTIDO
Sobe de Explorador a Globetrotter à medida que viajas. Desbloqueia badges por marcos como "10 países visitados" ou "viagem carbono zero". Mantém o teu streak mensal activo e compete no leaderboard global.

🌱 PEGADA DE CARBONO
Cada roteiro publicado mostra uma estimativa do CO₂ associado à viagem, comparada com a média de viagens semelhantes — para tomares decisões mais conscientes.

🎒 FERRAMENTAS QUE POUPAM TEMPO
- Lista de bagagem gerada por IA, ajustada ao destino, duração e estação do ano
- Controlo de despesas da viagem com conversão automática entre moedas
- Pesquisa rápida com sugestões em tempo real

🔒 A TUA PRIVACIDADE IMPORTA
O teu email é encriptado na base de dados. Decides quem vê cada roteiro e cada publicação — público, apenas seguidores, ou privado.

Descarrega o MemoVoy e começa a transformar a forma como planeias, vives e recordas as tuas viagens.
```

### Categoria de classificação etária
A preencher via questionário oficial do Play Console (IARC). Esperado: PEGI 3 / Livre, dado que a app não contém conteúdo explícito, mas inclui interacção social (comentários, mensagens) — deve assinalar "Interacção do utilizador" no questionário.

---

## Locale: pt-BR (Português — Brasil)

### Título
```
MemoVoy: Roteiros de Viagem
```

### Descrição curta
```
Crie roteiros com IA, compartilhe viagens e descubra destinos reais.
```

### Descrição completa
```
MemoVoy é a rede social de viagens onde cada roteiro conta uma história.

✈️ CRIE ROTEIROS EM MINUTOS
O assistente de IA do MemoVoy gera um roteiro completo — destino, dias, atividades e orçamento estimado — a partir de algumas perguntas simples. Prefere fazer manualmente? Você também pode construir seu roteiro dia a dia, com controle total.

📸 COMPARTILHE SUA VIAGEM
Publique fotos ligadas diretamente ao seu roteiro. Quem te segue vê não só a imagem, mas o contexto completo: onde foi, quando foi, o que você fez.

🔍 DESCUBRA DESTINOS REAIS
Explore roteiros publicados por outros viajantes do Brasil e de Portugal. Filtre por país, duração da viagem, tipo de grupo (sozinho, casal, família, amigos) ou estilo.

🏆 GAMIFICAÇÃO COM SENTIDO
Suba de Explorador a Globetrotter à medida que viaja. Desbloqueie badges por marcos como "10 países visitados" ou "viagem carbono zero". Mantenha seu streak mensal ativo e compita no ranking global.

🌱 PEGADA DE CARBONO
Cada roteiro publicado mostra uma estimativa do CO₂ associado à viagem, comparada com a média de viagens semelhantes — para você tomar decisões mais conscientes.

🎒 FERRAMENTAS QUE ECONOMIZAM TEMPO
- Lista de bagagem gerada por IA, ajustada ao destino, duração e estação do ano
- Controle de gastos da viagem com conversão automática entre moedas
- Busca rápida com sugestões em tempo real

🔒 SUA PRIVACIDADE IMPORTA
Seu e-mail é criptografado no banco de dados. Você decide quem vê cada roteiro e cada publicação — público, somente seguidores, ou privado.

Baixe o MemoVoy e comece a transformar a forma como planeja, vive e relembra suas viagens.
```

---

## Assets gráficos obrigatórios

| Asset | Especificação | Notas |
|---|---|---|
| Ícone da app | 512×512px, PNG, 32-bit com alpha | Mesmo conceito visual do ícone iOS |
| Imagem de destaque (Feature graphic) | 1024×500px, JPG ou PNG sem alpha | Mostrar logótipo + tagline sobre fundo com paisagem |
| Screenshots telemóvel | mín. 2, máx. 8 — 16:9 ou 9:16, lado mín. 320px, lado máx. 3840px | Usar os mesmos 5 conceitos do iOS |
| Screenshots tablet 7" | Opcional mas recomendado | |
| Screenshots tablet 10" | Opcional mas recomendado | |
| Vídeo promocional | Opcional — link do YouTube | 30-120 segundos |

---

## Formulário de classificação de conteúdo (IARC)

Respostas esperadas ao questionário automático do Google Play:

| Pergunta | Resposta |
|---|---|
| Violência | Não |
| Conteúdo sexual | Não |
| Linguagem imprópria | Não (mas comentários de utilizadores não são pré-moderados 100% — assinalar "gerado pelo utilizador") |
| Substâncias controladas | Não |
| Jogos de azar | Não |
| Partilha de localização | Sim (opcional, para notificações geo) |
| Interacção entre utilizadores | Sim (comentários, mensagens, seguir) |
| Compras digitais | Não (v1.0) |

---

## Secção de Segurança de Dados (Data Safety)

Equivalente ao "App Privacy" da Apple, mas com fluxo próprio no Play Console.

### Dados recolhidos
- **Informação pessoal**: nome, email (encriptado em repouso)
- **Localização**: aproximada, opcional, finalidade "funcionalidade da app"
- **Fotos e vídeos**: finalidade "funcionalidade da app"
- **Mensagens**: finalidade "funcionalidade da app" (comentários, DMs futuras)
- **Actividade na app**: histórico de pesquisa, interacções — finalidade "analytics" e "funcionalidade da app"
- **Identificadores do dispositivo**: para push notifications (token FCM)

### Práticas de segurança a declarar
- [x] Dados encriptados em trânsito (TLS em todos os endpoints)
- [x] Dados encriptados em repouso (campo email via `pgcrypto`)
- [x] Utilizador pode pedir eliminação dos dados (a implementar: endpoint `DELETE /users/me`)
- [ ] App segue a Política de Famílias do Google Play — **não aplicável**, app não é direccionada a crianças

### Partilha de dados com terceiros
- Anthropic (Claude API) — apenas o texto do prompt do wizard, sem PII directa
- Nenhum dado partilhado para fins publicitários

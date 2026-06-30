# MemoVoy — Setup Local

Rede social de viagens. Stack completa: API + Web + iOS + Android.

## Pré-requisitos

| Ferramenta | Versão mínima | Instalar |
|---|---|---|
| Node.js | 22 | https://nodejs.org |
| Docker Desktop | 24 | https://docker.com |
| Git | qualquer | https://git-scm.com |
| Xcode | 16 (iOS, opcional) | App Store |
| Android Studio | Koala (Android, opcional) | https://developer.android.com/studio |

---

## Setup em 5 minutos

### 1. Variáveis de ambiente

```bash
cd memovoy-api
cp .env.example .env

# Gerar secrets (correr cada linha separadamente)
node -e "console.log('JWT_ACCESS_SECRET=' + require('crypto').randomBytes(64).toString('hex'))"
node -e "console.log('JWT_REFRESH_SECRET=' + require('crypto').randomBytes(64).toString('hex'))"
node -e "console.log('EMAIL_ENCRYPTION_KEY=' + require('crypto').randomBytes(32).toString('base64'))"
```

Copiar os valores gerados para `.env`.

Para usar a geração de roteiros com IA, adicionar também:
```
ANTHROPIC_API_KEY=sk-ant-...
```

### 2. Base de dados e Redis

```bash
# Na pasta memovoy-api/
docker compose up db redis -d

# Aguardar ~10s e verificar
docker compose ps
```

### 3. Migrations

```bash
# Aplica as 17 migrations (requer Docker)
./setup_db.sh migrate

# Alternativa sem Flyway — aplicar directamente com psql:
for f in $(ls ../migrations/V*.sql | sort -V); do
  psql postgresql://memovoy:memovoy_dev_password@localhost:5432/memovoy_dev -f "$f"
done
```

### 4. Arrancar a API

```bash
# Na pasta memovoy-api/
npm install
npm run dev
# → http://localhost:3000
# → http://localhost:3000/docs  (documentação Swagger)
```

### 5. Arrancar o frontend

```bash
# Na pasta memovoy-web/
cp .env.local.example .env.local
npm install
npm run dev
# → http://localhost:3001
```

---

## Estrutura do projecto

```
memovoy/
├── memovoy-api/          API Fastify (Node.js 22)
│   ├── src/
│   │   ├── auth/         Login, registo, sessões
│   │   ├── users/        Perfis, follows
│   │   ├── itineraries/  Roteiros, dias, actividades
│   │   ├── feed/         Feed pessoal + discovery
│   │   ├── posts/        Posts, comentários
│   │   ├── ai/           Wizard IA (Claude Sonnet)
│   │   ├── gamification/ Badges, desafios, leaderboard
│   │   ├── notifications/Push notifications
│   │   ├── expenses/     Expense tracker
│   │   ├── packing/      Packing list IA
│   │   ├── search/       Pesquisa full-text (pg_trgm)
│   │   ├── workers/      Push, aggregator, moderation, fanout
│   │   └── plugins/      PostgreSQL, Redis
│   ├── docker-compose.yml
│   ├── setup_db.sh
│   └── .env.example
│
├── memovoy-web/          Frontend Next.js 15
│   └── src/
│       ├── app/          Páginas (feed, itineraries, search…)
│       ├── components/   NavBar, PostCard, etc.
│       ├── lib/          api-client, utils
│       └── store/        Zustand (auth)
│
├── memovoy-ios/          App iOS (SwiftUI)
│   └── MemoVoy/
│       ├── App/          Entry point, navegação
│       ├── Core/         APIClient, TokenStore, Models
│       └── Features/     Feed, Itineraries, Profile, Search…
│
├── memovoy-android/      App Android (Jetpack Compose)
│   └── app/src/main/java/com/memovoy/
│       ├── core/         ApiClient, TokenRepository, Models
│       └── features/     Feed, Itineraries, Profile, Search…
│
└── migrations/           17 migrations SQL (V1–V17)
```

---

## Credenciais de desenvolvimento

Após `./setup_db.sh migrate`, o seed cria um utilizador admin:

```
email:    admin@memovoy.dev
password: (definida na V10__seed_dev_data.sql)
```

Para criar utilizadores de teste via API:

```bash
curl -X POST http://localhost:3000/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"tu@exemplo.com","password":"Teste123!","username":"tuusername","countryCode":"PT"}'
```

---

## Comandos úteis

### API
```bash
npm run dev              # desenvolvimento com hot-reload
npm run test             # unit tests
npm run test:integration # integration tests (requer BD)
npm run worker:push      # worker de push notifications
npm run worker:aggregator # worker de agregação
npm run worker:moderation # worker de moderação
npm run db:migrate       # aplicar migrations
npm run db:info          # estado das migrations
```

### Frontend
```bash
npm run dev              # desenvolvimento (porta 3001)
npm run build            # build de produção
npm run start            # servir build de produção
```

### Docker
```bash
docker compose up db redis -d    # só BD e Redis
docker compose up -d             # tudo (inclui API)
docker compose logs -f api       # logs da API
docker compose down              # parar tudo
docker compose down -v           # parar e apagar dados
```

---

## Variáveis de ambiente completas

### memovoy-api/.env

```env
# Obrigatórias
DATABASE_URL=postgresql://memovoy:memovoy_dev_password@localhost:5432/memovoy_dev
JWT_ACCESS_SECRET=<64 bytes hex>
JWT_REFRESH_SECRET=<64 bytes hex diferente>
EMAIL_ENCRYPTION_KEY=<32 bytes base64>

# Opcional — para wizard IA
ANTHROPIC_API_KEY=sk-ant-...

# Opcional — Redis (fallback gracioso sem ele)
REDIS_URL=redis://localhost:6379

# Opcional — push notifications
FCM_SERVER_KEY=
FCM_PROJECT_ID=
APNS_KEY_P8=
APNS_KEY_ID=
APNS_TEAM_ID=
APNS_BUNDLE_ID=com.memovoy

# Configuração
NODE_ENV=development
HOST=0.0.0.0
PORT=3000
CORS_ORIGINS=http://localhost:3001
MODERATION_AUTO_APPROVE=true
```

### memovoy-web/.env.local

```env
NEXT_PUBLIC_API_URL=http://localhost:3000
```

---

## Bugs corrigidos durante o setup (já aplicados neste ZIP)

1. **RLS no registo** — `ALTER ROLE memovoy BYPASSRLS` necessário para INSERTs de sistema
2. **BigInt serialization** — `COUNT(*)` do PostgreSQL devolve BigInt; corrigido em `plugins/database.js`
3. **Publish sem body** — endpoint `/publish` não deve exigir `Content-Type: application/json`
4. **argon2 build** — compilar com `npm_config_nodedir=/usr npm install` quando os headers não são descarregados automaticamente

---

## iOS — Setup no Xcode

1. Abrir `memovoy-ios/` no Xcode 16+
2. Em `APIClient.swift`, alterar `baseURL` para `http://localhost:3000` (ou IP da máquina)
3. Adicionar `App Transport Security` ao `Info.plist` para HTTP local:
```xml
<key>NSAppTransportSecurity</key>
<dict>
  <key>NSAllowsLocalNetworking</key>
  <true/>
</dict>
```
4. `Cmd+R` para correr no simulador

## Android — Setup no Android Studio

1. Abrir `memovoy-android/` no Android Studio
2. Em `build.gradle.kts`, `API_BASE_URL` em debug já aponta para `http://10.0.2.2:3000` (emulador → localhost)
3. `Run > Run 'app'`

---

## Próximos passos antes de produção

- [ ] Substituir `BYPASSRLS` por policies RLS específicas para operações de sistema
- [ ] Configurar APNs + FCM para push notifications reais
- [ ] Adicionar `ANTHROPIC_API_KEY` real para wizard IA
- [ ] Setup de domínio + certificados TLS
- [ ] Revisão de segurança (ver `k8s/deployment.yaml` e `.github/workflows/ci.yml`)

# MemoVoy API

Backend REST em **Node.js 22 + Fastify 4**. Serve a app web (Next.js 15), iOS (SwiftUI) e Android (Jetpack Compose).

## Stack

| Camada | Tecnologia |
|---|---|
| Runtime | Node.js 22 (ESM nativo) |
| Framework | Fastify 4 |
| Base de dados | PostgreSQL 16 + PostGIS + TimescaleDB |
| Auth | JWT (access 15min + refresh 30d em httpOnly cookie) |
| Passwords | Argon2id (64MB, 3 iterações) |
| Validação | Zod |
| ORM | postgres.js (SQL directo — sem ORM) |

## Arranque rápido

```bash
# 1. Instalar dependências
npm install

# 2. Copiar e preencher variáveis de ambiente
cp .env.example .env
# Editar .env com os valores correctos

# 3. Arrancar base de dados (Docker)
docker compose up db redis -d

# 4. Executar migrations
./setup_db.sh migrate-only

# 5. Arrancar API em desenvolvimento
npm run dev
```

Ou tudo de uma vez com Docker:
```bash
docker compose up
```

## Endpoints

### Auth `/auth`

| Método | Rota | Auth | Descrição |
|---|---|---|---|
| POST | `/auth/register` | — | Criar conta |
| POST | `/auth/login` | — | Login |
| POST | `/auth/refresh` | Cookie | Renovar access token |
| POST | `/auth/logout` | JWT | Terminar sessão |
| GET | `/auth/sessions` | JWT | Listar sessões activas |
| DELETE | `/auth/sessions/:id` | JWT | Revogar sessão específica |
| DELETE | `/auth/sessions` | JWT | Revogar todas as outras sessões |

### Utilizadores `/users`

| Método | Rota | Auth | Descrição |
|---|---|---|---|
| GET | `/users/me` | JWT | Perfil completo (privado) |
| PATCH | `/users/me` | JWT | Actualizar perfil |
| PATCH | `/users/me/preferences` | JWT | Actualizar preferências |
| GET | `/users/:username` | Opcional | Perfil público |
| POST | `/users/:userId/follow` | JWT | Seguir utilizador |
| DELETE | `/users/:userId/follow` | JWT | Deixar de seguir |

### Roteiros `/itineraries`

| Método | Rota | Auth | Descrição |
|---|---|---|---|
| POST | `/itineraries` | JWT | Criar roteiro |
| GET | `/itineraries/mine` | JWT | Listar os meus roteiros |
| GET | `/itineraries/:id` | Opcional | Ver roteiro |
| POST | `/itineraries/:id/days` | JWT | Adicionar dia |
| POST | `/itineraries/days/:dayId/activities` | JWT | Adicionar actividade |
| POST | `/itineraries/:id/publish` | JWT | Publicar roteiro |
| DELETE | `/itineraries/:id` | JWT | Eliminar roteiro |
| POST | `/itineraries/:id/save` | JWT | Guardar roteiro |
| DELETE | `/itineraries/:id/save` | JWT | Remover dos guardados |

### Sistema

| Método | Rota | Descrição |
|---|---|---|
| GET | `/health` | Health check |

## Autenticação

A API usa **dois tokens JWT**:

- **Access Token** (15 min) — enviado no header `Authorization: Bearer <token>`. Curta duração por segurança.
- **Refresh Token** (30 dias) — guardado em cookie `httpOnly; Secure; SameSite=Strict`. Nunca acessível via JavaScript.

```bash
# Login
curl -c cookies.txt -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"user@example.com","password":"Password123"}'

# Usar access token
curl -H "Authorization: Bearer <access_token>" \
  http://localhost:3000/users/me

# Renovar access token (usa cookie automático)
curl -b cookies.txt -X POST http://localhost:3000/auth/refresh
```

## Estrutura do projecto

```
src/
├── server.js              ← Entry point — bootstrap e configuração
├── config/index.js        ← Variáveis de ambiente validadas
├── plugins/
│   └── database.js        ← Pool PostgreSQL + helpers RLS
├── middleware/
│   └── auth.js            ← authenticate, requireRole, optionalAuth
├── shared/
│   └── errors/index.js    ← Classes de erro tipadas + handler global
├── auth/
│   ├── auth.service.js    ← Lógica: register, login, refresh, logout
│   └── auth.routes.js     ← Rotas: /auth/*
├── users/
│   └── users.routes.js    ← Rotas: /users/*
└── itineraries/
    ├── itineraries.service.js  ← Lógica: CRUD roteiros
    └── itineraries.routes.js   ← Rotas: /itineraries/*
```

## Segurança

- **RLS activado** — cada query autenticada define `app.current_user_id` e `app.current_user_role` na transacção
- **Rate limiting** — 200 req/min global, 10 req/min em `/auth/*`
- **Argon2id** para passwords (64MB RAM, resistente a GPU attacks)
- **Email encriptado** em AES-256-GCM na BD, nunca em claro
- **Cookies httpOnly** para refresh tokens — imunes a XSS
- **Sessões suspeitas** detectadas por mudança de país IP

## Próximos passos (roadmap v1.0)

- [ ] Feed social (`/feed`)
- [ ] Posts e media (`/posts`)
- [ ] Wizard IA — integração Anthropic API
- [ ] Notificações push
- [ ] Packing list IA
- [ ] Expense tracker endpoints

### Notificações `/notifications`

| Método | Rota | Auth | Descrição |
|---|---|---|---|
| GET | `/notifications` | JWT | Listar notificações (cursor pagination) |
| GET | `/notifications/unread-count` | JWT | Badge count |
| PATCH | `/notifications/:id/read` | JWT | Marcar como lida |
| PATCH | `/notifications/read-all` | JWT | Marcar todas como lidas |
| POST | `/notifications/devices` | JWT | Registar push token |

### Expense Tracker `/itineraries/:id/expenses`

| Método | Rota | Auth | Descrição |
|---|---|---|---|
| GET | `/itineraries/:id/expenses` | JWT | Listar com totais por categoria |
| POST | `/itineraries/:id/expenses` | JWT | Registar gasto |
| PATCH | `/itineraries/:id/expenses/:expenseId` | JWT | Editar gasto |
| DELETE | `/itineraries/:id/expenses/:expenseId` | JWT | Apagar gasto |
| GET | `/itineraries/:id/expenses/rates` | — | Taxas de câmbio actuais |

### Packing List `/itineraries/:id/packing`

| Método | Rota | Auth | Descrição |
|---|---|---|---|
| GET | `/itineraries/:id/packing` | JWT | Buscar packing list |
| POST | `/itineraries/:id/packing/generate` | JWT | Gerar/regenerar com IA |
| PATCH | `/itineraries/:id/packing/toggle` | JWT | Marcar item checked/unchecked |
| POST | `/itineraries/:id/packing/items` | JWT | Adicionar item manual |
| DELETE | `/itineraries/:id/packing/items` | JWT | Remover item |

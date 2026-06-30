# Dockerfile — MemoVoy API (produção)
# Multi-stage build: compila numa imagem grande, corre numa mínima.

# ─── Stage 1: dependências ───────────────────────────────────────────────────
FROM node:22-alpine AS deps

WORKDIR /app

# Instalar build tools apenas neste stage (não chegam à imagem final)
RUN apk add --no-cache python3 make g++ libc6-compat

COPY package*.json ./
# ci instala versões exactas do package-lock.json
RUN npm ci --omit=dev

# ─── Stage 2: imagem de produção ─────────────────────────────────────────────
FROM node:22-alpine AS runner

# Utilizador não-root obrigatório em produção
RUN addgroup -S memovoy && adduser -S memovoy -G memovoy

WORKDIR /app

# Copiar dependências compiladas do stage anterior
COPY --from=deps --chown=memovoy:memovoy /app/node_modules ./node_modules

# Copiar apenas o código necessário (sem tests, docs, configs de dev)
COPY --chown=memovoy:memovoy src/ ./src/
COPY --chown=memovoy:memovoy package.json ./

# Mudar para utilizador sem privilégios
USER memovoy

EXPOSE 3000

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3000

# Healthcheck — o orchestrador mata o container se falhar
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://localhost:3000/health').then(r=>r.ok?process.exit(0):process.exit(1)).catch(()=>process.exit(1))"

CMD ["node", "src/server.js"]

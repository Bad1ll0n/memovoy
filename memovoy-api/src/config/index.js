// src/config/index.js
// Configuração central. Falha em arranque se variáveis obrigatórias estiverem em falta.

const required = (key) => {
  const val = process.env[key]
  if (!val) throw new Error(`Variável de ambiente obrigatória em falta: ${key}`)
  return val
}

const optional = (key, fallback) => process.env[key] ?? fallback

export const config = {
  env: optional('NODE_ENV', 'development'),
  isDev: optional('NODE_ENV', 'development') === 'development',

  server: {
    host: optional('HOST', '0.0.0.0'),
    port: parseInt(optional('PORT', '3000')),
  },

  db: {
    url: required('DATABASE_URL'),
    // DATABASE_URL = postgresql://user:pass@host:5432/memovoy_dev
    poolMin: parseInt(optional('DB_POOL_MIN', '2')),
    poolMax: parseInt(optional('DB_POOL_MAX', '10')),
  },

  jwt: {
    // Access token: curta duração (15 min) — nunca aumentar
    accessSecret: required('JWT_ACCESS_SECRET'),
    accessTtl: optional('JWT_ACCESS_TTL', '15m'),
    // Refresh token: longa duração (30 dias) — armazenado em httpOnly cookie
    refreshSecret: required('JWT_REFRESH_SECRET'),
    refreshTtl: optional('JWT_REFRESH_TTL', '30d'),
  },

  crypto: {
    // Chave para encriptação AES-256 do email (deve ter 32 bytes em base64)
    emailKey: required('EMAIL_ENCRYPTION_KEY'),
  },

  anthropic: {
    apiKey: required('ANTHROPIC_API_KEY'),
  },

  rateLimit: {
    // Limite global: 200 req/min por IP
    global: parseInt(optional('RATE_LIMIT_GLOBAL', '200')),
    // Limite de auth: 10 tentativas/min por IP (protege brute force)
    auth: parseInt(optional('RATE_LIMIT_AUTH', '10')),
  },

  cors: {
    // Origins permitidas — separadas por vírgula
    origins: optional('CORS_ORIGINS', 'http://localhost:3001').split(','),
  },

  redis: {
    url: optional('REDIS_URL', 'redis://localhost:6379'),
    // TTLs em segundos
    ttl: {
      discovery:    60,        // feed de descoberta: 1 min (muda com novos posts)
      topCountries: 3600,      // top países: 1 hora (muda raramente)
      userProfile:  300,       // perfil público: 5 min
      unreadCount:  30,        // badge de notificações: 30s
    },
  },
}

// src/shared/errors/index.js
// Erros tipados para respostas consistentes na API.
// O handler global em server.js converte estes em respostas JSON.

export class AppError extends Error {
  constructor(message, statusCode = 500, code = 'INTERNAL_ERROR') {
    super(message)
    this.name = this.constructor.name
    this.statusCode = statusCode
    this.code = code
  }
}

// 400 — input inválido (validação falhou)
export class ValidationError extends AppError {
  constructor(message, details = null) {
    super(message, 400, 'VALIDATION_ERROR')
    this.details = details
  }
}

// 401 — não autenticado
export class UnauthorizedError extends AppError {
  constructor(message = 'Autenticação necessária') {
    super(message, 401, 'UNAUTHORIZED')
  }
}

// 403 — autenticado mas sem permissão
export class ForbiddenError extends AppError {
  constructor(message = 'Sem permissão para esta acção') {
    super(message, 403, 'FORBIDDEN')
  }
}

// 404 — recurso não encontrado
export class NotFoundError extends AppError {
  constructor(resource = 'Recurso') {
    super(`${resource} não encontrado`, 404, 'NOT_FOUND')
  }
}

// 409 — conflito (ex: email já existe)
export class ConflictError extends AppError {
  constructor(message) {
    super(message, 409, 'CONFLICT')
  }
}

// 429 — rate limit
export class TooManyRequestsError extends AppError {
  constructor(message = 'Demasiados pedidos. Tenta novamente mais tarde.') {
    super(message, 429, 'RATE_LIMIT_EXCEEDED')
  }
}

// Handler global de erros para o Fastify
// Registar em server.js: fastify.setErrorHandler(errorHandler)
export function errorHandler(error, request, reply) {
  const log = request.log

  // Erros da nossa aplicação — esperados, log em debug
  if (error instanceof AppError) {
    log.debug({ err: error, code: error.code }, error.message)
    return reply.status(error.statusCode).send({
      error: {
        code: error.code,
        message: error.message,
        ...(error.details && { details: error.details }),
      },
    })
  }

  // Erros de validação do Fastify/Zod
  if (error.statusCode === 400 || error.validation) {
    log.debug({ err: error }, 'Erro de validação')
    return reply.status(400).send({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Dados inválidos',
        details: error.validation || error.message,
      },
    })
  }

  // Erros JWT do @fastify/jwt
  if (error.code === 'FST_JWT_AUTHORIZATION_TOKEN_EXPIRED') {
    return reply.status(401).send({
      error: { code: 'TOKEN_EXPIRED', message: 'Token expirado' },
    })
  }
  if (error.code?.startsWith('FST_JWT')) {
    return reply.status(401).send({
      error: { code: 'TOKEN_INVALID', message: 'Token inválido' },
    })
  }

  // Rate limit do @fastify/rate-limit
  if (error.statusCode === 429) {
    return reply.status(429).send({
      error: { code: 'RATE_LIMIT_EXCEEDED', message: error.message },
    })
  }

  // Erros inesperados — log completo, resposta genérica (nunca expor stack)
  log.error({ err: error }, 'Erro inesperado')
  return reply.status(500).send({
    error: {
      code: 'INTERNAL_ERROR',
      message: 'Erro interno. Tenta novamente.',
    },
  })
}

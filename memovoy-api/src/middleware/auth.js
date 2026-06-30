// src/middleware/auth.js
// Hooks de autenticação para rotas protegidas.
// Usar como preHandler nas rotas que requerem autenticação.

import { UnauthorizedError, ForbiddenError } from '../shared/errors/index.js'

// -------------------------------------------------------
// authenticate: verifica o Access Token JWT
// Injeta request.user = { id, role, dbRegion }
// Usar em todas as rotas autenticadas.
// -------------------------------------------------------
export async function authenticate(request, reply) {
  try {
    // Verifica o JWT do header Authorization: Bearer <token>
    await request.jwtVerify()
    // request.user é preenchido pelo @fastify/jwt com o payload do token
  } catch (err) {
    // Deixar o errorHandler global tratar erros JWT
    throw err
  }
}

// -------------------------------------------------------
// requireRole: verifica que o utilizador tem um dos roles exigidos
// Usar após authenticate.
//
// Exemplo:
//   preHandler: [authenticate, requireRole('admin')]
// -------------------------------------------------------
export function requireRole(...roles) {
  return async function (request) {
    if (!roles.includes(request.user?.role)) {
      throw new ForbiddenError(
        `Esta acção requer um dos seguintes roles: ${roles.join(', ')}`
      )
    }
  }
}

// -------------------------------------------------------
// optionalAuth: tenta verificar o JWT mas não falha se não existir
// Útil para rotas públicas que têm comportamento diferente
// quando o utilizador está autenticado (ex: feed público vs personalizado)
// -------------------------------------------------------
export async function optionalAuth(request) {
  try {
    await request.jwtVerify()
  } catch {
    // Sem token ou token inválido — continuar como anónimo
    request.user = null
  }
}

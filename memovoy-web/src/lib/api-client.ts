// src/lib/api-client.ts
// Cliente HTTP central para o Next.js.
// Gere: injecção de token, refresh automático em 401, erros tipados.
// Funciona em cliente e servidor (Server Components passam o token via arg).

const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000'

// ---------------------------------------------------------------------------
// Erros tipados
// ---------------------------------------------------------------------------

export class ApiError extends Error {
  constructor(
    public readonly code:       string,
    message:                    string,
    public readonly statusCode: number,
    public readonly details?:   unknown,
  ) {
    super(message)
    this.name = 'ApiError'
  }

  get isUnauthorized() { return this.statusCode === 401 }
  get isConflict()     { return this.statusCode === 409 }
  get isNotFound()     { return this.statusCode === 404 }
  get isValidation()   { return this.statusCode === 400 }
}

// ---------------------------------------------------------------------------
// Token store (browser-only — SSR usa cookies via middleware)
// ---------------------------------------------------------------------------

let _accessToken: string | null = null

export const tokenStore = {
  get:   ()          => _accessToken,
  set:   (t: string) => { _accessToken = t },
  clear: ()          => { _accessToken = null },
}

// ---------------------------------------------------------------------------
// Fetch com retry de refresh automático
// ---------------------------------------------------------------------------

let _refreshPromise: Promise<string> | null = null

async function refreshToken(): Promise<string> {
  // Serializar refreshes concorrentes — um só executa
  if (_refreshPromise) return _refreshPromise

  _refreshPromise = fetch(`${BASE_URL}/auth/refresh`, {
    method:      'POST',
    credentials: 'include',  // envia o httpOnly refresh cookie
  })
    .then(async (r) => {
      if (!r.ok) throw new ApiError('UNAUTHORIZED', 'Sessão expirada', 401)
      const data = await r.json()
      const token = data.accessToken as string
      tokenStore.set(token)
      return token
    })
    .finally(() => { _refreshPromise = null })

  return _refreshPromise
}

// ---------------------------------------------------------------------------
// Função base de fetch
// ---------------------------------------------------------------------------

export interface FetchOptions extends RequestInit {
  token?:      string | null   // injectar explicitamente (Server Components)
  skipRefresh?: boolean        // evitar loop no próprio /auth/refresh
  params?:     Record<string, string | number | boolean | undefined>
}

async function apiFetch<T>(
  path:    string,
  options: FetchOptions = {},
): Promise<T> {
  const { token, skipRefresh, params, ...init } = options

  // Query string
  let url = `${BASE_URL}${path}`
  if (params) {
    const qs = Object.entries(params)
      .filter(([, v]) => v !== undefined)
      .map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`)
      .join('&')
    if (qs) url += `?${qs}`
  }

  // Headers
  const headers = new Headers(init.headers)
  headers.set('Content-Type',  'application/json')
  headers.set('Accept',        'application/json')

  const effectiveToken = token ?? tokenStore.get()
  if (effectiveToken) headers.set('Authorization', `Bearer ${effectiveToken}`)

  const response = await fetch(url, {
    ...init,
    headers,
    credentials: 'include',  // para cookies de refresh
  })

  // 204 No Content
  if (response.status === 204) return undefined as T

  // 401 — tentar refresh uma vez
  if (response.status === 401 && !skipRefresh) {
    try {
      const newToken = await refreshToken()
      headers.set('Authorization', `Bearer ${newToken}`)
      const retried = await fetch(url, { ...init, headers, credentials: 'include' })
      if (retried.status === 204) return undefined as T
      if (!retried.ok) throw await buildError(retried)
      return retried.json() as Promise<T>
    } catch (e) {
      if (e instanceof ApiError && e.isUnauthorized) {
        tokenStore.clear()
        // Redirecionar para login em client-side
        if (typeof window !== 'undefined') {
          window.location.href = '/auth/login'
        }
      }
      throw e
    }
  }

  if (!response.ok) throw await buildError(response)
  return response.json() as Promise<T>
}

async function buildError(response: Response): Promise<ApiError> {
  let code = 'UNKNOWN_ERROR'
  let message = response.statusText
  let details: unknown

  try {
    const body = await response.json()
    code    = body.error?.code    ?? code
    message = body.error?.message ?? message
    details = body.error?.details
  } catch { /* corpo não é JSON */ }

  return new ApiError(code, message, response.status, details)
}

// ---------------------------------------------------------------------------
// API tipada por método
// ---------------------------------------------------------------------------

export const api = {
  get: <T>(path: string, options?: FetchOptions) =>
    apiFetch<T>(path, { ...options, method: 'GET' }),

  post: <T>(path: string, body?: unknown, options?: FetchOptions) =>
    apiFetch<T>(path, {
      ...options,
      method: 'POST',
      body:   body !== undefined ? JSON.stringify(body) : undefined,
    }),

  patch: <T>(path: string, body?: unknown, options?: FetchOptions) =>
    apiFetch<T>(path, {
      ...options,
      method: 'PATCH',
      body:   body !== undefined ? JSON.stringify(body) : undefined,
    }),

  delete: <T = void>(path: string, options?: FetchOptions) =>
    apiFetch<T>(path, { ...options, method: 'DELETE' }),
}

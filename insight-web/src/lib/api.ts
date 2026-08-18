import { useAuthStore } from '@/store/authStore'

export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000'

class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

let _accessToken: string | null = null

export function setAccessToken(token: string | null) {
  _accessToken = token
}

export function getAccessToken() {
  return _accessToken
}

async function request<T>(path: string, init: RequestInit = {}, _retry = true): Promise<T> {
  const headers: Record<string, string> = {
    ...(init.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
    ...(init.headers as Record<string, string>),
  }

  if (_accessToken) {
    headers['Authorization'] = `Bearer ${_accessToken}`
  }

  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers,
    credentials: 'include',
  })

  if (!res.ok) {
    if (res.status === 401 && _retry) {
      try {
        const r = await fetch(`${API_URL}/auth/refresh`, { method: 'POST', credentials: 'include' })
        if (r.ok) {
          const { accessToken } = await r.json()
          setAccessToken(accessToken)
          useAuthStore.getState().setToken(accessToken)
          return request<T>(path, init, false)
        }
      } catch {
        // refresh failed — fall through to throw
      }
    }

    let message = res.statusText
    try {
      const body = await res.json()
      message = body.message ?? message
    } catch {
      // keep statusText
    }
    throw new ApiError(res.status, message)
  }

  if (res.status === 204) return undefined as T
  return res.json() as Promise<T>
}

async function uploadFile<T>(path: string, file: File): Promise<T> {
  const formData = new FormData()
  formData.append('file', file)

  const headers: Record<string, string> = {}
  if (_accessToken) headers['Authorization'] = `Bearer ${_accessToken}`

  const res = await fetch(`${API_URL}${path}`, {
    method: 'POST',
    body: formData,
    headers,
    credentials: 'include',
  })

  if (!res.ok) {
    let message = res.statusText
    try {
      const body = await res.json()
      message = body.message ?? message
    } catch {
      // keep statusText
    }
    throw new ApiError(res.status, message)
  }

  return res.json() as Promise<T>
}

export const api = {
  get: <T>(path: string, init?: RequestInit) =>
    request<T>(path, { ...init, method: 'GET' }),

  post: <T>(path: string, body?: unknown, init?: RequestInit) =>
    request<T>(path, { ...init, method: 'POST', body: JSON.stringify(body) }),

  put: <T>(path: string, body?: unknown, init?: RequestInit) =>
    request<T>(path, { ...init, method: 'PUT', body: JSON.stringify(body) }),

  patch: <T>(path: string, body?: unknown, init?: RequestInit) =>
    request<T>(path, { ...init, method: 'PATCH', body: JSON.stringify(body) }),

  delete: <T>(path: string, body?: unknown, init?: RequestInit) =>
    request<T>(path, { ...init, method: 'DELETE', ...(body !== undefined ? { body: JSON.stringify(body) } : {}) }),

  uploadFile: <T>(path: string, file: File) => uploadFile<T>(path, file),
}

export { ApiError }

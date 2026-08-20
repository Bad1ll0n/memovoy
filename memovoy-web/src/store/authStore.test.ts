import { describe, test, expect, beforeEach } from 'vitest'
import { useAuthStore, type AuthUser } from './authStore'

const utilizador: AuthUser = {
  id: 'u1', username: 'ana', email: 'ana@exemplo.pt', displayName: 'Ana',
  avatarUrl: null, coverUrl: null, bio: null, location: null, website: null,
  isPrivate: false,
  shareUpcomingTrips: false, isVerified: false, score: 0,
  emailVerified: true, onboardingCompleted: true,
}

beforeEach(() => {
  useAuthStore.setState({ user: null, accessToken: null, isHydrated: false })
})

describe('useAuthStore', () => {
  test('começa sem sessão e por hidratar', () => {
    const s = useAuthStore.getState()
    expect(s.user).toBeNull()
    expect(s.accessToken).toBeNull()
    expect(s.isHydrated).toBe(false)
  })

  test('setAuth guarda utilizador e token juntos', () => {
    useAuthStore.getState().setAuth(utilizador, 'token-1')
    const s = useAuthStore.getState()
    expect(s.user).toEqual(utilizador)
    expect(s.accessToken).toBe('token-1')
  })

  test('setToken troca o token sem perder o utilizador — é o caminho do refresh', () => {
    useAuthStore.getState().setAuth(utilizador, 'token-1')
    useAuthStore.getState().setToken('token-2')

    const s = useAuthStore.getState()
    expect(s.accessToken).toBe('token-2')
    expect(s.user).toEqual(utilizador)
  })

  test('clearAuth apaga utilizador e token', () => {
    useAuthStore.getState().setAuth(utilizador, 'token-1')
    useAuthStore.getState().clearAuth()

    const s = useAuthStore.getState()
    expect(s.user).toBeNull()
    expect(s.accessToken).toBeNull()
  })

  test('clearAuth não desfaz a hidratação — evita voltar ao ecrã de carregamento no logout', () => {
    useAuthStore.getState().hydrate()
    useAuthStore.getState().setAuth(utilizador, 'token-1')
    useAuthStore.getState().clearAuth()

    expect(useAuthStore.getState().isHydrated).toBe(true)
  })

  test('hydrate marca a store como hidratada sem tocar na sessão', () => {
    useAuthStore.getState().setAuth(utilizador, 'token-1')
    useAuthStore.getState().hydrate()

    const s = useAuthStore.getState()
    expect(s.isHydrated).toBe(true)
    expect(s.user).toEqual(utilizador)
    expect(s.accessToken).toBe('token-1')
  })
})

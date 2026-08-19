import { create } from 'zustand'

export interface AuthUser {
  id: string
  username: string
  email: string
  displayName: string
  avatarUrl: string | null
  coverUrl: string | null
  bio: string | null
  location: string | null
  website: string | null
  isPrivate: boolean
  isVerified: boolean
  score: number
  emailVerified: boolean
  onboardingCompleted: boolean
  // Só para decidir se o atalho de moderação aparece. A autorização é sempre
  // do servidor, que relê a flag da base de dados em cada pedido.
  isAdmin?: boolean
}

interface AuthState {
  user: AuthUser | null
  accessToken: string | null
  isHydrated: boolean
  setAuth: (user: AuthUser, token: string) => void
  setToken: (token: string) => void
  clearAuth: () => void
  hydrate: () => void
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  accessToken: null,
  isHydrated: false,

  setAuth: (user, accessToken) => set({ user, accessToken }),
  setToken: (accessToken) => set({ accessToken }),
  clearAuth: () => set({ user: null, accessToken: null }),
  hydrate: () => set({ isHydrated: true }),
}))

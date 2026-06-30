// src/store/auth.ts
// Estado global de autenticação via Zustand.
// Persiste userId e username em localStorage — nunca o access token.
// O access token vive apenas em memória (tokenStore no api-client).

import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import type { AuthUser } from '@/types'
import { api, tokenStore }  from '@/lib/api-client'

interface AuthState {
  user:            AuthUser | null
  isAuthenticated: boolean
  isHydrated:      boolean

  // Acções
  login:    (email: string, password: string) => Promise<void>
  register: (data: RegisterData)              => Promise<void>
  logout:   ()                               => Promise<void>
  setUser:  (user: AuthUser, token: string)  => void
  hydrate:  ()                               => void
}

interface RegisterData {
  email:       string
  password:    string
  username:    string
  countryCode: string
  language:    string
}

interface AuthResponse {
  user:        AuthUser
  accessToken: string
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user:            null,
      isAuthenticated: false,
      isHydrated:      false,

      setUser: (user, token) => {
        tokenStore.set(token)
        set({ user, isAuthenticated: true })
      },

      login: async (email, password) => {
        const res = await api.post<AuthResponse>('/auth/login', {
          email:    email.trim().toLowerCase(),
          password,
        })
        tokenStore.set(res.accessToken)
        set({ user: res.user, isAuthenticated: true })
      },

      register: async (data) => {
        const res = await api.post<AuthResponse>('/auth/register', {
          ...data,
          email:    data.email.trim().toLowerCase(),
          username: data.username.trim().toLowerCase(),
        })
        tokenStore.set(res.accessToken)
        set({ user: res.user, isAuthenticated: true })
      },

      logout: async () => {
        try {
          await api.post('/auth/logout', undefined, { skipRefresh: true })
        } catch { /* best-effort */ }
        tokenStore.clear()
        set({ user: null, isAuthenticated: false })
      },

      hydrate: () => set({ isHydrated: true }),
    }),
    {
      name:    'memovoy-auth',
      storage: createJSONStorage(() =>
        typeof window !== 'undefined' ? localStorage : {
          getItem:    () => null,
          setItem:    () => {},
          removeItem: () => {},
        }
      ),
      // Persiste apenas dados não-sensíveis
      partialize: (state) => ({
        user:            state.user,
        isAuthenticated: state.isAuthenticated,
      }),
      onRehydrateStorage: () => (state) => {
        state?.hydrate()
      },
    }
  )
)

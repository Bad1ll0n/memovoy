// @vitest-environment jsdom
import { describe, test, expect, afterEach, beforeEach, vi } from 'vitest'
import { screen, cleanup, fireEvent, waitFor } from '@testing-library/react'
import { EmailVerificationBanner } from './EmailVerificationBanner'
import { useAuthStore, type AuthUser } from '@/store/authStore'
import { renderComProviders } from '@/test-utils'

vi.mock('@/lib/api', () => ({
  api: { post: vi.fn(() => Promise.resolve({})) },
}))

const { api } = await import('@/lib/api')

const UTILIZADOR: AuthUser = {
  id: 'u1', username: 'ana', email: 'ana@exemplo.pt', displayName: 'Ana',
  avatarUrl: null, coverUrl: null, bio: null, location: null, website: null,
  isPrivate: false, isVerified: false, score: 0,
  emailVerified: false, onboardingCompleted: true,
}

function entrarComo(user: AuthUser | null) {
  useAuthStore.setState({ user, accessToken: user ? 'token' : null, isHydrated: true })
}

beforeEach(() => {
  vi.clearAllMocks()
  entrarComo(UTILIZADOR)
})

afterEach(cleanup)

describe('quando aparece', () => {
  test('aparece a quem não verificou o email', () => {
    renderComProviders(<EmailVerificationBanner />)
    expect(screen.getByText(/Verifica o teu email/)).toBeTruthy()
  })

  test('não aparece a quem já verificou', () => {
    entrarComo({ ...UTILIZADOR, emailVerified: true })
    renderComProviders(<EmailVerificationBanner />)
    expect(screen.queryByText(/Verifica o teu email/)).toBeNull()
  })

  test('não aparece a quem não tem sessão', () => {
    entrarComo(null)
    renderComProviders(<EmailVerificationBanner />)
    expect(screen.queryByText(/Verifica o teu email/)).toBeNull()
  })

  // Regressão. O PATCH /users/me devolvia um DTO sem emailVerified, e o
  // frontend metia-o na store com setAuth() — o campo ficava undefined e este
  // aviso reaparecia a quem já tinha verificado. A API foi corrigida; este
  // teste fixa o que o componente faz quando o campo falta.
  test('emailVerified em falta é tratado como não verificado', () => {
    // O campo é obrigatório no tipo — daí o Record para o poder retirar.
    // É exactamente essa a situação que a API produzia: o tipo prometia-o e a
    // resposta não o trazia.
    const semCampo = { ...UTILIZADOR } as Record<string, unknown>
    delete semCampo.emailVerified
    entrarComo(semCampo as unknown as AuthUser)

    renderComProviders(<EmailVerificationBanner />)

    expect(screen.getByText(/Verifica o teu email/)).toBeTruthy()
  })
})

describe('dispensar', () => {
  test('o botão de fechar esconde o aviso', () => {
    renderComProviders(<EmailVerificationBanner />)

    fireEvent.click(screen.getByLabelText('Fechar aviso'))

    expect(screen.queryByText(/Verifica o teu email/)).toBeNull()
  })
})

describe('reenviar email', () => {
  test('chama a API de reenvio', async () => {
    renderComProviders(<EmailVerificationBanner />)

    fireEvent.click(screen.getByText('Reenviar email'))

    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/auth/resend-verification'))
  })

  test('confirma ao utilizador depois de enviar', async () => {
    renderComProviders(<EmailVerificationBanner />)

    fireEvent.click(screen.getByText('Reenviar email'))

    await waitFor(() => expect(screen.getByText(/Email enviado/)).toBeTruthy())
    expect(screen.queryByText('Reenviar email')).toBeNull()
  })

  test('se o envio falhar, o botão continua disponível para tentar de novo', async () => {
    vi.mocked(api.post).mockRejectedValueOnce(new Error('rede em baixo'))

    renderComProviders(<EmailVerificationBanner />)
    fireEvent.click(screen.getByText('Reenviar email'))

    await waitFor(() => expect(api.post).toHaveBeenCalled())
    expect(screen.queryByText(/Email enviado/)).toBeNull()
    expect(screen.getByText('Reenviar email')).toBeTruthy()
  })
})

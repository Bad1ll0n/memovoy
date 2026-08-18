// @vitest-environment jsdom
import { describe, test, expect, afterEach, beforeEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { FeatureTour } from './FeatureTour'
import { useAuthStore, type AuthUser } from '@/store/authStore'

// Este componente foi refactorizado de estado-sincronizado-por-efeito para
// useValorDoCliente. Estes testes fixam o que ele decide: a quem aparece,
// quando desaparece, e que a decisão fica gravada.

const TOUR_KEY = 'memovoy-tour-v1'

const UTILIZADOR: AuthUser = {
  id: 'u1', username: 'ana', email: 'ana@exemplo.pt', displayName: 'Ana',
  avatarUrl: null, coverUrl: null, bio: null, location: null, website: null,
  isPrivate: false, isVerified: false, score: 0,
  emailVerified: true, onboardingCompleted: true,
}

function entrarComo(user: AuthUser | null) {
  useAuthStore.setState({ user, accessToken: user ? 'token' : null, isHydrated: true })
}

const tourVisivel = () => screen.queryByRole('dialog') !== null

beforeEach(() => {
  localStorage.clear()
  entrarComo(UTILIZADOR)
})

afterEach(cleanup)

describe('quando aparece', () => {
  test('aparece a quem tem sessão e nunca o viu', () => {
    render(<FeatureTour />)
    expect(tourVisivel()).toBe(true)
  })

  test('não aparece a quem não tem sessão', () => {
    entrarComo(null)
    render(<FeatureTour />)
    expect(tourVisivel()).toBe(false)
  })

  test('não aparece a quem já o viu', () => {
    localStorage.setItem(TOUR_KEY, '1')
    render(<FeatureTour />)
    expect(tourVisivel()).toBe(false)
  })

  test('começa no primeiro passo', () => {
    render(<FeatureTour />)
    expect(screen.getByText('Planeia com IA')).toBeTruthy()
  })
})

describe('navegar pelos passos', () => {
  test('o botão avança até ao último passo', () => {
    render(<FeatureTour />)

    expect(screen.getByText('Planeia com IA')).toBeTruthy()

    fireEvent.click(screen.getByText('Próximo'))
    expect(screen.getByText('Vê as actividades no mapa')).toBeTruthy()

    fireEvent.click(screen.getByText('Próximo'))
    expect(screen.getByText('Conquistas e pontuação')).toBeTruthy()
  })

  test('o último passo mostra "Entendido" em vez de "Próximo"', () => {
    render(<FeatureTour />)

    fireEvent.click(screen.getByText('Próximo'))
    fireEvent.click(screen.getByText('Próximo'))

    expect(screen.getByText('Entendido')).toBeTruthy()
    expect(screen.queryByText('Próximo')).toBeNull()
  })

  test('"Entendido" fecha o tour e grava que foi visto', () => {
    render(<FeatureTour />)

    fireEvent.click(screen.getByText('Próximo'))
    fireEvent.click(screen.getByText('Próximo'))
    fireEvent.click(screen.getByText('Entendido'))

    expect(tourVisivel()).toBe(false)
    expect(localStorage.getItem(TOUR_KEY)).toBe('1')
  })
})

describe('fechar a meio', () => {
  test('o X fecha e grava — não volta a aparecer', () => {
    render(<FeatureTour />)

    fireEvent.click(screen.getByLabelText('Fechar tour'))

    expect(tourVisivel()).toBe(false)
    expect(localStorage.getItem(TOUR_KEY)).toBe('1')
  })

  test('depois de fechado não reaparece numa montagem nova', () => {
    render(<FeatureTour />)
    fireEvent.click(screen.getByLabelText('Fechar tour'))
    cleanup()

    render(<FeatureTour />)
    expect(tourVisivel()).toBe(false)
  })
})

describe('acessibilidade', () => {
  test('é um diálogo com nome que identifica o passo', () => {
    render(<FeatureTour />)
    expect(screen.getByRole('dialog').getAttribute('aria-label')).toContain('Planeia com IA')
  })
})

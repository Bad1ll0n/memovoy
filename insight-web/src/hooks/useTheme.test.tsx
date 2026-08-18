// @vitest-environment jsdom
import { describe, test, expect, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, act } from '@testing-library/react'
import { useTheme } from './useTheme'

// O tema é aplicado ao <html> por um script inline em app/layout.tsx, antes
// da hidratação, para não haver flash. Este hook governa o estado que o botão
// de alternar mostra, e escreve o tema escolhido no localStorage e no DOM.

function Sonda() {
  const { theme, toggle } = useTheme()
  return <button onClick={toggle}>tema: {theme}</button>
}

const html = () => document.documentElement

beforeEach(() => {
  localStorage.clear()
  html().removeAttribute('data-theme')
})

afterEach(cleanup)

describe('useTheme', () => {
  test('assume escuro quando não há nada guardado', () => {
    render(<Sonda />)
    expect(screen.getByRole('button').textContent).toBe('tema: dark')
  })

  test('lê o tema claro guardado no localStorage', () => {
    localStorage.setItem('memovoy-theme', 'light')
    render(<Sonda />)
    expect(screen.getByRole('button').textContent).toBe('tema: light')
  })

  test('valor desconhecido no localStorage cai para escuro', () => {
    localStorage.setItem('memovoy-theme', 'seja-o-que-for')
    render(<Sonda />)
    expect(screen.getByRole('button').textContent).toBe('tema: dark')
  })

  test('alternar para claro põe data-theme=light no html', () => {
    render(<Sonda />)
    act(() => { screen.getByRole('button').click() })

    expect(html().getAttribute('data-theme')).toBe('light')
    expect(screen.getByRole('button').textContent).toBe('tema: light')
  })

  test('alternar de volta remove o atributo — escuro é a ausência dele', () => {
    localStorage.setItem('memovoy-theme', 'light')
    html().setAttribute('data-theme', 'light')
    render(<Sonda />)

    act(() => { screen.getByRole('button').click() })

    expect(html().hasAttribute('data-theme')).toBe(false)
    expect(screen.getByRole('button').textContent).toBe('tema: dark')
  })

  test('persiste a escolha no localStorage', () => {
    render(<Sonda />)
    act(() => { screen.getByRole('button').click() })
    expect(localStorage.getItem('memovoy-theme')).toBe('light')

    act(() => { screen.getByRole('button').click() })
    expect(localStorage.getItem('memovoy-theme')).toBe('dark')
  })

  test('alternar duas vezes volta ao estado inicial', () => {
    render(<Sonda />)
    const botao = screen.getByRole('button')

    act(() => { botao.click() })
    act(() => { botao.click() })

    expect(botao.textContent).toBe('tema: dark')
    expect(html().hasAttribute('data-theme')).toBe(false)
  })
})

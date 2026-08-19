// @vitest-environment jsdom
import { describe, test, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { ErroDePagina } from './ErroDePagina'

vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}))

afterEach(cleanup)

describe('ErroDePagina', () => {
  test('mostra o texto por omissão e a saída para o início', () => {
    render(<ErroDePagina />)

    expect(screen.getByText('Alguma coisa correu mal')).toBeTruthy()
    const link = screen.getByRole('link', { name: /Ir para o início/i }) as HTMLAnchorElement
    expect(link.getAttribute('href')).toBe('/feed')
  })

  test('o botão de repetir chama o reset da fronteira de erro', () => {
    const reset = vi.fn()
    render(<ErroDePagina reset={reset} />)

    fireEvent.click(screen.getByRole('button', { name: /Tentar outra vez/i }))

    expect(reset).toHaveBeenCalledTimes(1)
  })

  test('sem reset não há botão de repetir', () => {
    // É o caso do not-found: não há nada para repetir, a página não existe.
    render(<ErroDePagina />)

    expect(screen.queryByRole('button', { name: /Tentar outra vez/i })).toBeNull()
  })

  test('mostra o digest, que é o que permite achar o erro nos registos', () => {
    render(<ErroDePagina digest="a1b2c3" />)

    expect(screen.getByText(/a1b2c3/)).toBeTruthy()
  })

  test('a mensagem do erro nunca aparece no ecrã', () => {
    // O componente recebe título e descrição, nunca o Error. Detalhes internos
    // não têm nada que ir parar à frente de quem usa a app.
    render(<ErroDePagina titulo="Falhou" descricao="Tenta outra vez." />)

    expect(screen.queryByText(/at Object\.|stack|node_modules/i)).toBeNull()
    expect(screen.getByText('Falhou')).toBeTruthy()
  })
})

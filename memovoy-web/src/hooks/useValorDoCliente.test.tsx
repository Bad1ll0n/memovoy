// @vitest-environment jsdom
import { describe, test, expect, afterEach, beforeEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { useEstaHidratado, useValorDoCliente } from './useValorDoCliente'

// Estes dois hooks sustentam a leitura de localStorage e capacidades do
// browser em cinco componentes. Um erro aqui espalha-se por todos.

afterEach(cleanup)

describe('useEstaHidratado', () => {
  function Sonda() {
    return <span>{useEstaHidratado() ? 'hidratado' : 'servidor'}</span>
  }

  test('devolve true depois de montar no cliente', () => {
    render(<Sonda />)
    expect(screen.getByText('hidratado')).toBeTruthy()
  })
})

describe('useValorDoCliente', () => {
  const CHAVE = 'valor-de-teste'

  function Sonda({ ler, noServidor }: { ler: () => string; noServidor: string }) {
    return <span>{useValorDoCliente(ler, noServidor)}</span>
  }

  beforeEach(() => localStorage.clear())

  test('devolve o que a função de leitura der', () => {
    localStorage.setItem(CHAVE, 'guardado')
    render(<Sonda ler={() => localStorage.getItem(CHAVE) ?? 'nada'} noServidor="omissao" />)
    expect(screen.getByText('guardado')).toBeTruthy()
  })

  test('cai no valor de omissão quando não há nada guardado', () => {
    render(<Sonda ler={() => localStorage.getItem(CHAVE) ?? 'nada'} noServidor="omissao" />)
    expect(screen.getByText('nada')).toBeTruthy()
  })

  test('lê capacidades do browser sem rebentar', () => {
    function Capacidade() {
      const tem = useValorDoCliente(() => 'localStorage' in window, false)
      return <span>{tem ? 'suportado' : 'nao'}</span>
    }
    render(<Capacidade />)
    expect(screen.getByText('suportado')).toBeTruthy()
  })

  test('uma leitura que lança não deve chegar aqui — cabe à função tratar', () => {
    // Documenta o contrato: quem lê o localStorage envolve em try/catch,
    // porque em modo privado o acesso pode lançar. O hook não o faz por si.
    const ler = () => {
      try {
        throw new Error('acesso negado')
      } catch {
        return 'fallback'
      }
    }
    render(<Sonda ler={ler} noServidor="omissao" />)
    expect(screen.getByText('fallback')).toBeTruthy()
  })

  test('valores primitivos estáveis não provocam re-render infinito', () => {
    let leituras = 0
    function Contador() {
      const v = useValorDoCliente(() => { leituras++; return 'estavel' }, 'servidor')
      return <span>{v}</span>
    }

    render(<Contador />)

    expect(screen.getByText('estavel')).toBeTruthy()
    // Sem estabilidade o React entraria em ciclo e isto seria um número enorme.
    expect(leituras).toBeLessThan(20)
  })
})

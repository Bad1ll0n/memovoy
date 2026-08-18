// @vitest-environment jsdom
import { describe, test, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup, act } from '@testing-library/react'
import { useEstaAoVivo, JANELA_AO_VIVO_MS } from './useEstaAoVivo'

function Sonda({ createdAt }: { createdAt: string }) {
  return <span>{useEstaAoVivo(createdAt) ? 'ao vivo' : 'normal'}</span>
}

/** Instante ISO a N milissegundos no passado. */
const haMs = (ms: number) => new Date(Date.now() - ms).toISOString()

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('useEstaAoVivo', () => {
  test('post acabado de publicar está ao vivo', () => {
    render(<Sonda createdAt={haMs(0)} />)
    expect(screen.getByText('ao vivo')).toBeTruthy()
  })

  test('post de há uma hora ainda está ao vivo', () => {
    render(<Sonda createdAt={haMs(60 * 60 * 1000)} />)
    expect(screen.getByText('ao vivo')).toBeTruthy()
  })

  test('post fora da janela de duas horas não está', () => {
    render(<Sonda createdAt={haMs(JANELA_AO_VIVO_MS + 1000)} />)
    expect(screen.getByText('normal')).toBeTruthy()
  })

  test('post com data no futuro não conta como ao vivo', () => {
    // Relógios dessincronizados entre cliente e servidor não devem
    // marcar um post como perpetuamente ao vivo.
    const futuro = new Date(Date.now() + 60 * 60 * 1000).toISOString()
    render(<Sonda createdAt={futuro} />)
    expect(screen.getByText('normal')).toBeTruthy()
  })

  test('data inválida não rebenta nem marca ao vivo', () => {
    render(<Sonda createdAt="isto-nao-e-uma-data" />)
    expect(screen.getByText('normal')).toBeTruthy()
  })

  test('deixa de estar ao vivo quando o tempo passa a fronteira', () => {
    vi.useFakeTimers()
    // Faltam dois minutos para sair da janela.
    render(<Sonda createdAt={haMs(JANELA_AO_VIVO_MS - 2 * 60_000)} />)
    expect(screen.getByText('ao vivo')).toBeTruthy()

    // Três tiques do relógio partilhado (um por minuto) atravessam a fronteira.
    act(() => { vi.advanceTimersByTime(3 * 60_000) })

    expect(screen.getByText('normal')).toBeTruthy()
  })

  test('o temporizador pára quando o último post desmonta', () => {
    vi.useFakeTimers()
    const { unmount } = render(<Sonda createdAt={haMs(0)} />)
    expect(vi.getTimerCount()).toBe(1)

    unmount()
    expect(vi.getTimerCount()).toBe(0)
  })

  test('vários posts partilham um só temporizador', () => {
    vi.useFakeTimers()
    render(
      <>
        <Sonda createdAt={haMs(0)} />
        <Sonda createdAt={haMs(1000)} />
        <Sonda createdAt={haMs(2000)} />
      </>,
    )
    expect(vi.getTimerCount()).toBe(1)
  })
})

// @vitest-environment jsdom
import { describe, test, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { useRef } from 'react'
import { useDialogoModal } from './useDialogoModal'

// Extraído do ConfirmModal quando se viu que os outros diálogos da app não
// tinham nada disto: o ReportModal e o CreatePostModal abriam sem role de
// diálogo e sem saída pelo Escape.

afterEach(cleanup)

function Dialogo({ open = true, onClose = () => {}, comFocoInicial = false }) {
  const segundoRef = useRef<HTMLButtonElement>(null)
  const caixaRef = useDialogoModal(open, onClose, comFocoInicial ? segundoRef : undefined)

  if (!open) return null

  return (
    <div ref={caixaRef} data-testid="caixa">
      <button>primeiro</button>
      <button ref={segundoRef}>segundo</button>
      <button disabled>desactivado</button>
      <button>último</button>
    </div>
  )
}

describe('sair do diálogo', () => {
  test('o Escape fecha', () => {
    const onClose = vi.fn()
    render(<Dialogo onClose={onClose} />)

    fireEvent.keyDown(window, { key: 'Escape' })

    expect(onClose).toHaveBeenCalledTimes(1)
  })

  test('fechado, o Escape já não faz nada', () => {
    const onClose = vi.fn()
    const { rerender } = render(<Dialogo onClose={onClose} />)

    rerender(<Dialogo open={false} onClose={onClose} />)
    fireEvent.keyDown(window, { key: 'Escape' })

    expect(onClose).not.toHaveBeenCalled()
  })
})

describe('armadilha de foco', () => {
  test('Tab no último volta ao primeiro', () => {
    render(<Dialogo />)

    screen.getByText('último').focus()
    fireEvent.keyDown(window, { key: 'Tab' })

    expect(document.activeElement).toBe(screen.getByText('primeiro'))
  })

  test('Shift+Tab no primeiro vai para o último', () => {
    render(<Dialogo />)

    screen.getByText('primeiro').focus()
    fireEvent.keyDown(window, { key: 'Tab', shiftKey: true })

    expect(document.activeElement).toBe(screen.getByText('último'))
  })

  test('elementos desactivados ficam fora do ciclo', () => {
    // Um botão desactivado não recebe foco no browser; incluí-lo na lista fazia
    // o ciclo parar num elemento que nunca chega a ser focado.
    render(<Dialogo />)

    screen.getByText('último').focus()
    fireEvent.keyDown(window, { key: 'Tab' })

    expect(document.activeElement).not.toBe(screen.getByText('desactivado'))
  })

  test('foco perdido volta para dentro no Tab seguinte', () => {
    // Depois de um clique no fundo, o foco pode ficar no <body>. O Tab tem de o
    // trazer de volta em vez de continuar a percorrer a página por baixo.
    render(<Dialogo />)

    ;(document.activeElement as HTMLElement)?.blur()
    document.body.focus()

    fireEvent.keyDown(window, { key: 'Tab' })

    expect(screen.getByTestId('caixa').contains(document.activeElement)).toBe(true)
  })

  test('outras teclas não são interceptadas', () => {
    render(<Dialogo />)
    const ultimo = screen.getByText('último')
    ultimo.focus()

    fireEvent.keyDown(window, { key: 'a' })

    expect(document.activeElement).toBe(ultimo)
  })
})

describe('foco de entrada e de saída', () => {
  test('sem indicação, foca o primeiro focável', () => {
    render(<Dialogo />)

    expect(document.activeElement).toBe(screen.getByText('primeiro'))
  })

  test('com indicação, foca o elemento pedido', () => {
    // Num diálogo de confirmação o primeiro focável é o X de fechar, e o que
    // deve ficar debaixo do dedo é o Cancelar.
    render(<Dialogo comFocoInicial />)

    expect(document.activeElement).toBe(screen.getByText('segundo'))
  })

  test('ao fechar, o foco volta a quem abriu', () => {
    const abridor = document.createElement('button')
    document.body.appendChild(abridor)
    abridor.focus()

    const { rerender } = render(<Dialogo />)
    expect(document.activeElement).not.toBe(abridor)

    rerender(<Dialogo open={false} />)

    expect(document.activeElement).toBe(abridor)
    abridor.remove()
  })
})

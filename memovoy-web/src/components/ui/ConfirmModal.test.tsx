// @vitest-environment jsdom
import { describe, test, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { ConfirmModal } from './ConfirmModal'

// É o portão antes de tudo o que é destrutivo — apagar uma publicação, remover
// conteúdo na moderação, eliminar a conta. Não tinha teste nenhum.

afterEach(cleanup)

const base = {
  open: true,
  title: 'Apagar a publicação?',
  description: 'Não há forma de a recuperar.',
  onConfirm: () => {},
  onCancel: () => {},
}

describe('quando está fechado', () => {
  test('não põe nada no documento', () => {
    render(<ConfirmModal {...base} open={false} />)

    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.queryByText('Apagar a publicação?')).toBeNull()
  })
})

describe('formas de cancelar', () => {
  test('a tecla Escape cancela', () => {
    const onCancel = vi.fn()
    render(<ConfirmModal {...base} onCancel={onCancel} />)

    fireEvent.keyDown(window, { key: 'Escape' })

    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  test('clicar no fundo cancela', () => {
    const onCancel = vi.fn()
    render(<ConfirmModal {...base} onCancel={onCancel} />)

    fireEvent.click(screen.getByRole('dialog'))

    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  test('clicar dentro da caixa não cancela', () => {
    // Seleccionar texto da descrição não pode fechar o diálogo.
    const onCancel = vi.fn()
    render(<ConfirmModal {...base} onCancel={onCancel} />)

    fireEvent.click(screen.getByText('Não há forma de a recuperar.'))

    expect(onCancel).not.toHaveBeenCalled()
  })

  test('o Escape deixa de escutar depois de fechar', () => {
    // Um listener em window que fique para trás cancela diálogos que já não
    // existem — ou pior, o seguinte.
    const onCancel = vi.fn()
    const { rerender } = render(<ConfirmModal {...base} onCancel={onCancel} />)

    rerender(<ConfirmModal {...base} open={false} onCancel={onCancel} />)
    fireEvent.keyDown(window, { key: 'Escape' })

    expect(onCancel).not.toHaveBeenCalled()
  })
})

describe('confirmar', () => {
  test('o botão de confirmar chama onConfirm', () => {
    const onConfirm = vi.fn()
    render(<ConfirmModal {...base} confirmLabel="Apagar" onConfirm={onConfirm} />)

    fireEvent.click(screen.getByRole('button', { name: 'Apagar' }))

    expect(onConfirm).toHaveBeenCalledTimes(1)
  })

  test('durante o carregamento os dois botões ficam bloqueados', () => {
    // Sem isto, dois cliques rápidos disparam a acção destrutiva duas vezes.
    const onConfirm = vi.fn()
    render(<ConfirmModal {...base} loading onConfirm={onConfirm} />)

    const botoes = screen.getAllByRole('button')
      .filter((b) => b.getAttribute('aria-label') !== 'Fechar')

    // .disabled directamente: este projecto não usa os matchers do jest-dom.
    for (const b of botoes) expect((b as HTMLButtonElement).disabled).toBe(true)

    fireEvent.click(botoes.at(-1)!)
    expect(onConfirm).not.toHaveBeenCalled()
  })
})

describe('teclado e foco', () => {
  test('o foco começa em Cancelar, não em Confirmar', () => {
    // O botão seguro é o que deve estar debaixo do dedo: um Enter distraído
    // não pode apagar nada.
    render(<ConfirmModal {...base} cancelLabel="Cancelar" />)

    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Cancelar' }))
  })

  test('o Tab não sai do diálogo', () => {
    // O diálogo declara aria-modal="true", o que diz aos leitores de ecrã que o
    // resto da página está inerte. Se o Tab sair na mesma, quem navega por
    // teclado acaba a interagir com uma página que lhe foi anunciada como
    // inacessível.
    render(<ConfirmModal {...base} confirmLabel="Apagar" cancelLabel="Cancelar" />)

    const dialogo = screen.getByRole('dialog')
    const focaveis = Array.from(dialogo.querySelectorAll('button'))
    const ultimo = focaveis.at(-1)!

    ultimo.focus()
    fireEvent.keyDown(dialogo, { key: 'Tab' })

    expect(dialogo.contains(document.activeElement)).toBe(true)
    expect(document.activeElement).toBe(focaveis[0])
  })

  test('Shift+Tab no primeiro elemento vai para o último', () => {
    render(<ConfirmModal {...base} />)

    const dialogo = screen.getByRole('dialog')
    const focaveis = Array.from(dialogo.querySelectorAll('button'))

    focaveis[0].focus()
    fireEvent.keyDown(dialogo, { key: 'Tab', shiftKey: true })

    expect(document.activeElement).toBe(focaveis.at(-1))
  })

  test('ao fechar, o foco volta a quem abriu o diálogo', () => {
    // Sem isto o foco fica no <body> e quem navega por teclado recomeça do
    // topo da página em vez de voltar ao botão que carregou.
    const abridor = document.createElement('button')
    abridor.textContent = 'Apagar'
    document.body.appendChild(abridor)
    abridor.focus()

    const { rerender } = render(<ConfirmModal {...base} />)
    expect(document.activeElement).not.toBe(abridor)

    rerender(<ConfirmModal {...base} open={false} />)

    expect(document.activeElement).toBe(abridor)
    abridor.remove()
  })
})

describe('semântica', () => {
  test('é um diálogo modal com título associado', () => {
    render(<ConfirmModal {...base} />)

    const dialogo = screen.getByRole('dialog')
    expect(dialogo.getAttribute('aria-modal')).toBe('true')

    const idDoTitulo = dialogo.getAttribute('aria-labelledby')
    expect(idDoTitulo).toBeTruthy()
    expect(document.getElementById(idDoTitulo!)?.textContent).toBe('Apagar a publicação?')
  })
})

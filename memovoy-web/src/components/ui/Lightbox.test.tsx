// @vitest-environment jsdom
import { describe, test, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup, act, fireEvent } from '@testing-library/react'
import { Lightbox } from './Lightbox'

// next/image não corre fora do Next: substituído por um <img> simples para os
// testes poderem inspeccionar o src. A regra do LCP não se aplica a um mock.
vi.mock('next/image', () => ({
  // eslint-disable-next-line @next/next/no-img-element
  default: ({ src, alt }: { src: string; alt: string }) => <img src={src} alt={alt} />,
}))

const FOTOS = ['/a.jpg', '/b.jpg', '/c.jpg']

afterEach(() => {
  cleanup()
  document.body.style.overflow = ''
})

function abrir(props: Partial<React.ComponentProps<typeof Lightbox>> = {}) {
  const onClose = vi.fn()
  render(<Lightbox images={FOTOS} onClose={onClose} {...props} />)
  return { onClose }
}

const fotoVisivel = () => (screen.getByRole('img') as HTMLImageElement).getAttribute('src')

describe('Lightbox', () => {
  test('mostra a primeira imagem por omissão', () => {
    abrir()
    expect(fotoVisivel()).toBe('/a.jpg')
  })

  test('respeita o índice inicial', () => {
    abrir({ initialIndex: 2 })
    expect(fotoVisivel()).toBe('/c.jpg')
  })

  test('avança e recua com os botões', () => {
    abrir()

    fireEvent.click(screen.getByLabelText('Próxima'))
    expect(fotoVisivel()).toBe('/b.jpg')

    fireEvent.click(screen.getByLabelText('Anterior'))
    expect(fotoVisivel()).toBe('/a.jpg')
  })

  test('avançar na última volta à primeira', () => {
    abrir({ initialIndex: 2 })
    fireEvent.click(screen.getByLabelText('Próxima'))
    expect(fotoVisivel()).toBe('/a.jpg')
  })

  test('recuar na primeira salta para a última', () => {
    abrir()
    fireEvent.click(screen.getByLabelText('Anterior'))
    expect(fotoVisivel()).toBe('/c.jpg')
  })

  test('as setas do teclado navegam', () => {
    abrir()

    act(() => { fireEvent.keyDown(window, { key: 'ArrowRight' }) })
    expect(fotoVisivel()).toBe('/b.jpg')

    act(() => { fireEvent.keyDown(window, { key: 'ArrowLeft' }) })
    expect(fotoVisivel()).toBe('/a.jpg')
  })

  test('Escape fecha', () => {
    const { onClose } = abrir()
    act(() => { fireEvent.keyDown(window, { key: 'Escape' }) })
    expect(onClose).toHaveBeenCalledOnce()
  })

  test('o botão de fechar fecha', () => {
    const { onClose } = abrir()
    fireEvent.click(screen.getByLabelText('Fechar'))
    expect(onClose).toHaveBeenCalledOnce()
  })

  test('tranca o scroll do body enquanto está aberto e devolve-o ao fechar', () => {
    const { unmount } = render(<Lightbox images={FOTOS} onClose={() => {}} />)
    expect(document.body.style.overflow).toBe('hidden')

    unmount()
    expect(document.body.style.overflow).toBe('')
  })

  test('com uma só imagem não mostra setas de navegação', () => {
    render(<Lightbox images={['/unica.jpg']} onClose={() => {}} />)

    expect(screen.queryByLabelText('Próxima')).toBeNull()
    expect(screen.queryByLabelText('Anterior')).toBeNull()
    expect(screen.getByLabelText('Fechar')).toBeTruthy()
  })

  test('deixa de ouvir o teclado depois de desmontar', () => {
    const onClose = vi.fn()
    const { unmount } = render(<Lightbox images={FOTOS} onClose={onClose} />)

    unmount()
    act(() => { fireEvent.keyDown(window, { key: 'Escape' }) })

    expect(onClose).not.toHaveBeenCalled()
  })
})

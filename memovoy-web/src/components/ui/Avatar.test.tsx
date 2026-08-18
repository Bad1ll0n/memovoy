// @vitest-environment jsdom
import { describe, test, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { Avatar } from './Avatar'

// next/image não corre fora do Next.
vi.mock('next/image', () => ({
  // eslint-disable-next-line @next/next/no-img-element
  default: ({ src, alt }: { src: string; alt: string }) => <img src={src} alt={alt} />,
}))

afterEach(cleanup)

describe('Avatar com imagem', () => {
  test('mostra a imagem e usa o nome como texto alternativo', () => {
    render(<Avatar src="/ana.jpg" name="Ana Silva" />)

    const img = screen.getByRole('img') as HTMLImageElement
    expect(img.getAttribute('src')).toBe('/ana.jpg')
    expect(img.getAttribute('alt')).toBe('Ana Silva')
  })

  test('src vazio cai para as iniciais', () => {
    render(<Avatar src="" name="Ana Silva" />)
    expect(screen.queryByRole('img')).toBeNull()
    expect(screen.getByText('AS')).toBeTruthy()
  })

  test('src nulo cai para as iniciais', () => {
    render(<Avatar src={null} name="Ana Silva" />)
    expect(screen.getByText('AS')).toBeTruthy()
  })
})

describe('Avatar sem imagem — iniciais', () => {
  test('duas palavras dão duas iniciais', () => {
    render(<Avatar name="Ana Silva" />)
    expect(screen.getByText('AS')).toBeTruthy()
  })

  test('uma palavra dá uma inicial', () => {
    render(<Avatar name="Ana" />)
    expect(screen.getByText('A')).toBeTruthy()
  })

  test('mais de duas palavras usa só as duas primeiras', () => {
    render(<Avatar name="Ana Maria Silva Costa" />)
    expect(screen.getByText('AM')).toBeTruthy()
  })

  test('põe em maiúsculas', () => {
    render(<Avatar name="ana silva" />)
    expect(screen.getByText('AS')).toBeTruthy()
  })

  test('preserva iniciais acentuadas', () => {
    render(<Avatar name="Óscar Ávila" />)
    expect(screen.getByText('ÓÁ')).toBeTruthy()
  })

  test('espaços a mais não produzem iniciais vazias', () => {
    render(<Avatar name="Ana   Silva" />)
    expect(screen.getByText('AS')).toBeTruthy()
  })

  test('expõe o nome completo a leitores de ecrã', () => {
    render(<Avatar name="Ana Silva" />)
    expect(screen.getByLabelText('Ana Silva')).toBeTruthy()
  })
})

describe('Avatar — tamanhos', () => {
  test('cada tamanho aplica a sua classe', () => {
    const casos: [Parameters<typeof Avatar>[0]['size'], string][] = [
      ['xs', 'w-6'], ['sm', 'w-8'], ['md', 'w-10'], ['lg', 'w-12'], ['xl', 'w-22'],
    ]

    for (const [size, classe] of casos) {
      cleanup()
      render(<Avatar name="Ana Silva" size={size} />)
      expect(screen.getByLabelText('Ana Silva').className).toContain(classe)
    }
  })

  test('o tamanho por omissão é md', () => {
    render(<Avatar name="Ana Silva" />)
    expect(screen.getByLabelText('Ana Silva').className).toContain('w-10')
  })
})

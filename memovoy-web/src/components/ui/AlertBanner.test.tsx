// @vitest-environment jsdom
import { describe, test, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { AlertBanner } from './AlertBanner'
import { isVideoUrl } from './VideoPlayer'
import { EmptyState } from './EmptyState'

afterEach(cleanup)

describe('AlertBanner', () => {
  test.each(['danger', 'info', 'success'] as const)('a variante %s anuncia-se como alerta', (variant) => {
    // role="alert" é o que faz um leitor de ecrã ler a mensagem sem esperar
    // que a pessoa lá chegue por navegação. Num aviso de erro, isso é a
    // diferença entre saber e não saber que algo correu mal.
    render(<AlertBanner variant={variant} message="Correu mal" />)

    expect(screen.getByRole('alert').textContent).toContain('Correu mal')
  })

  test('nenhuma variante escreve cores em código', () => {
    // O sucesso tinha #16a34a sobre um verde a 10%: 4,12:1 no tema escuro e
    // 3,02 no claro, falha os dois. As outras variantes já usavam classes com
    // tokens; só esta é que não, e por isso escapava ao tema.
    for (const variant of ['danger', 'info', 'success'] as const) {
      cleanup()
      render(<AlertBanner variant={variant} message="x" />)
      const estilo = screen.getByRole('alert').getAttribute('style') ?? ''

      expect(estilo, `a variante ${variant} tem cores literais`).not.toMatch(/#[0-9a-fA-F]{6}|rgba?\(\d/)
    }
  })
})

describe('isVideoUrl', () => {
  test.each(['/a.mp4', '/b.webm', '/c.mov', '/d.MP4', 'https://x.pt/v.mp4?t=1'])(
    'reconhece %s como vídeo', (url) => {
      expect(isVideoUrl(url)).toBe(true)
    },
  )

  test.each(['/a.jpg', '/b.png', '/c.mp4.jpg', '/mp4', '/video/mp4/foto.png', ''])(
    'não confunde %s com vídeo', (url) => {
      // O caso '/c.mp4.jpg' é o que interessa: um teste de "contém .mp4" dava
      // falso positivo e a app tentava reproduzir uma imagem.
      expect(isVideoUrl(url)).toBe(false)
    },
  )
})

describe('EmptyState', () => {
  test('mostra o título e a descrição', () => {
    render(<EmptyState title="Nada aqui" description="Ainda não há publicações." />)

    expect(screen.getByText('Nada aqui')).toBeTruthy()
    expect(screen.getByText('Ainda não há publicações.')).toBeTruthy()
  })

  test('a acção com href é um link, não um botão', () => {
    // Um destino de navegação tem de ser um link: abre em nova aba, aparece no
    // menu de contexto, e é anunciado como link a quem usa leitor de ecrã.
    render(<EmptyState title="x" action={{ label: 'Explorar', href: '/explore' }} />)

    const link = screen.getByRole('link', { name: 'Explorar' })
    expect(link.getAttribute('href')).toBe('/explore')
  })

  test('a acção com onClick é um botão', () => {
    let clicado = false
    render(<EmptyState title="x" action={{ label: 'Tentar', onClick: () => { clicado = true } }} />)

    screen.getByRole('button', { name: 'Tentar' }).click()

    expect(clicado).toBe(true)
  })

  test('sem descrição nem acção, mostra só o título', () => {
    render(<EmptyState title="Só isto" />)

    expect(screen.getByText('Só isto')).toBeTruthy()
    expect(screen.queryByRole('link')).toBeNull()
    expect(screen.queryByRole('button')).toBeNull()
  })

  test('as ilustrações são decorativas e ficam fora da árvore de acessibilidade', () => {
    // Um SVG decorativo sem aria-hidden é lido como "imagem" sem descrição —
    // ruído para quem usa leitor de ecrã.
    const { container } = render(<EmptyState title="x" illustration="feed" />)

    const svg = container.querySelector('svg')
    expect(svg?.getAttribute('aria-hidden')).not.toBeNull()
  })
})

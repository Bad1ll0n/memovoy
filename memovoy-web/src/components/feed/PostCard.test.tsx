// @vitest-environment jsdom
import { describe, test, expect, afterEach, beforeEach, vi } from 'vitest'
import { screen, cleanup, fireEvent, waitFor } from '@testing-library/react'
import { renderComProviders } from '@/test-utils'
import { PostCard, type Post } from './PostCard'

// O componente mais usado da app, e sem um único teste.
//
// O que aqui interessa não é a aparência: são as actualizações optimistas. O
// gosto e o guardar mudam a cache antes de a API responder e revertem se ela
// falhar. Um erro nessa reversão não parte nada visivelmente — deixa a
// interface a mostrar uma coisa e o servidor a saber outra, e ninguém dá por
// isso até recarregar a página.

const api = vi.hoisted(() => ({
  post: vi.fn(() => Promise.resolve({})),
  delete: vi.fn(() => Promise.resolve({})),
  get: vi.fn(() => Promise.resolve({})),
}))

const toast = vi.hoisted(() => vi.fn())

vi.mock('@/lib/api', () => ({ api, API_URL: '', getAccessToken: () => 't' }))
vi.mock('@/store/toastStore', () => ({ toast }))
vi.mock('next/image', () => ({
  // eslint-disable-next-line @next/next/no-img-element
  default: ({ src, alt }: { src: string; alt: string }) => <img src={src} alt={alt} />,
}))
vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a>,
}))
vi.mock('@/store/authStore', () => ({
  useAuthStore: () => ({ user: { id: 'eu', username: 'eu' } }),
}))

const QUERY_KEY = ['feed']

function fazerPost(over: Partial<Post> = {}): Post {
  return {
    id: 'p1', userId: 'outro', username: 'ana', displayName: 'Ana',
    avatarUrl: null, isVerified: false, caption: 'Lisboa é linda',
    images: ['/a.jpg'], destination: 'Lisboa',
    likesCount: 10, commentsCount: 2,
    viewerLiked: false, viewerSaved: false,
    createdAt: new Date().toISOString(),
    ...over,
  }
}

/** Monta o cartão com a cache paginada que o componente espera manipular. */
function montar(post: Post) {
  const r = renderComProviders(<PostCard post={post} queryKey={QUERY_KEY} />)
  r.queryClient.setQueryData(QUERY_KEY, { pages: [{ posts: [post] }] })
  return r
}

/**
 * Uma promessa cuja rejeição é disparada pelo teste.
 *
 * Com um mockRejectedValue simples, o onMutate e o onError acontecem os dois
 * antes de o waitFor correr pela primeira vez: o estado optimista é demasiado
 * efémero para ser observado, e o teste não conseguia distinguir "reverteu" de
 * "nunca chegou a mudar". Segurando a rejeição, as duas fases ficam separadas.
 */
function promessaSuspensa() {
  let rejeitar: (e: Error) => void
  const p = new Promise<Record<string, never>>((_, rej) => { rejeitar = rej })
  // A rejeição é tratada quando o teste a dispara; sem isto o Node avisa.
  p.catch(() => {})
  return { p, rejeitar: (e: Error) => rejeitar!(e) }
}

/** O estado do post dentro da cache, que é o que a UI acaba por ler. */
function naCache(qc: ReturnType<typeof montar>['queryClient']) {
  const d = qc.getQueryData(QUERY_KEY) as { pages: { posts: Post[] }[] } | undefined
  return d?.pages[0].posts.find((p) => p.id === 'p1')
}

beforeEach(() => {
  api.post.mockReset().mockResolvedValue({})
  api.delete.mockReset().mockResolvedValue({})
  toast.mockReset()
})
afterEach(cleanup)

describe('gostar', () => {
  test('o contador sobe antes de a API responder', async () => {
    const { queryClient } = montar(fazerPost({ likesCount: 10, viewerLiked: false }))

    fireEvent.click(screen.getByLabelText('Curtir'))

    await waitFor(() => {
      expect(naCache(queryClient)?.likesCount).toBe(11)
      expect(naCache(queryClient)?.viewerLiked).toBe(true)
    })
    expect(api.post).toHaveBeenCalledWith('/posts/p1/like')
  })

  test('descurtir desce o contador e chama o DELETE', async () => {
    const { queryClient } = montar(fazerPost({ likesCount: 10, viewerLiked: true }))

    fireEvent.click(screen.getByLabelText('Descurtir'))

    await waitFor(() => {
      expect(naCache(queryClient)?.likesCount).toBe(9)
      expect(naCache(queryClient)?.viewerLiked).toBe(false)
    })
    expect(api.delete).toHaveBeenCalledWith('/posts/p1/like')
  })

  test('se a API falhar, o contador volta atrás', async () => {
    // É esta a parte que ninguém vê partir. Sem a reversão, o coração fica
    // pintado e o número subido, e o servidor não sabe de nada.
    const { p, rejeitar } = promessaSuspensa()
    api.post.mockReturnValue(p)
    const { queryClient } = montar(fazerPost({ likesCount: 10, viewerLiked: false }))

    fireEvent.click(screen.getByLabelText('Curtir'))

    // Primeiro a subida optimista, com a API ainda pendurada. Verificar as duas
    // fases é o que distingue "reverteu" de "nunca chegou a mudar".
    await waitFor(() => expect(naCache(queryClient)?.likesCount).toBe(11))

    rejeitar(new Error('rede'))

    await waitFor(() => {
      expect(naCache(queryClient)?.likesCount).toBe(10)
      expect(naCache(queryClient)?.viewerLiked).toBe(false)
    })
  })

  test('descurtir que falha também volta atrás', async () => {
    const { p, rejeitar } = promessaSuspensa()
    api.delete.mockReturnValue(p)
    const { queryClient } = montar(fazerPost({ likesCount: 10, viewerLiked: true }))

    fireEvent.click(screen.getByLabelText('Descurtir'))

    await waitFor(() => expect(naCache(queryClient)?.likesCount).toBe(9))

    rejeitar(new Error('rede'))

    await waitFor(() => {
      expect(naCache(queryClient)?.likesCount).toBe(10)
      expect(naCache(queryClient)?.viewerLiked).toBe(true)
    })
  })
})

describe('guardar', () => {
  test('marca como guardado de imediato', async () => {
    const { queryClient } = montar(fazerPost({ viewerSaved: false }))

    fireEvent.click(screen.getByLabelText('Guardar'))

    await waitFor(() => expect(naCache(queryClient)?.viewerSaved).toBe(true))
    expect(api.post).toHaveBeenCalledWith('/bookmarks', { postId: 'p1' })
  })

  test('desmarcar chama o DELETE do bookmark', async () => {
    const { queryClient } = montar(fazerPost({ viewerSaved: true }))

    fireEvent.click(screen.getByLabelText('Remover dos guardados'))

    await waitFor(() => expect(naCache(queryClient)?.viewerSaved).toBe(false))
    expect(api.delete).toHaveBeenCalledWith('/bookmarks/post/p1')
  })

  test('falhar reverte o estado de guardado', async () => {
    const { p, rejeitar } = promessaSuspensa()
    api.post.mockReturnValue(p)
    const { queryClient } = montar(fazerPost({ viewerSaved: false }))

    fireEvent.click(screen.getByLabelText('Guardar'))

    await waitFor(() => expect(naCache(queryClient)?.viewerSaved).toBe(true))

    rejeitar(new Error('rede'))

    await waitFor(() => expect(naCache(queryClient)?.viewerSaved).toBe(false))
  })
})

describe('apagar com desfazer', () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => { vi.useRealTimers() })

  /** Abre o menu e carrega em Eliminar. */
  function apagar() {
    fireEvent.click(screen.getByLabelText('Opções'))
    fireEvent.click(screen.getByText(/eliminar/i))
  }

  test('o post sai da lista de imediato, mas a API só é chamada 5s depois', () => {
    // A janela de 5s é o que dá tempo a desfazer. Chamar a API já tornava o
    // "desfazer" numa mentira.
    const { queryClient } = montar(fazerPost({ userId: 'eu' }))

    apagar()

    expect(naCache(queryClient)).toBeUndefined()
    expect(api.delete).not.toHaveBeenCalled()

    vi.advanceTimersByTime(5000)
    expect(api.delete).toHaveBeenCalledWith('/posts/p1')
  })

  test('desfazer repõe o post e não chega a apagar nada', () => {
    const { queryClient } = montar(fazerPost({ userId: 'eu' }))

    apagar()
    expect(naCache(queryClient)).toBeUndefined()

    // O desfazer vive no toast; é de lá que o utilizador lhe chega.
    const opcoes = toast.mock.calls.at(-1)?.[1]
    expect(opcoes?.undoFn, 'o toast de eliminação tem de trazer um desfazer').toBeTypeOf('function')
    opcoes.undoFn()

    expect(naCache(queryClient)?.id).toBe('p1')

    vi.advanceTimersByTime(10_000)
    expect(api.delete).not.toHaveBeenCalled()
  })
})

describe('conteúdo', () => {
  test('mostra a legenda e o destino', () => {
    montar(fazerPost())

    expect(screen.getByText('Lisboa é linda')).toBeTruthy()
    expect(screen.getAllByText(/Lisboa/).length).toBeGreaterThan(0)
  })

  test('o menu de opções abre e fecha ao clicar fora', () => {
    montar(fazerPost({ userId: 'eu' }))

    fireEvent.click(screen.getByLabelText('Opções'))
    expect(screen.queryByText(/eliminar/i)).toBeTruthy()

    fireEvent.mouseDown(document.body)
    expect(screen.queryByText(/eliminar/i)).toBeNull()
  })

  test('não se pode eliminar a publicação de outra pessoa', () => {
    montar(fazerPost({ userId: 'outro' }))

    fireEvent.click(screen.getByLabelText('Opções'))

    expect(screen.queryByText(/eliminar/i)).toBeNull()
  })
})

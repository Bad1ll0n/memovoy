// @vitest-environment jsdom
import { describe, test, expect, afterEach, beforeEach, vi } from 'vitest'
import { render, cleanup, act } from '@testing-library/react'
import { SocketProvider, useSocket } from './SocketProvider'
import { criarQueryClient } from '@/test-utils'
import { QueryClientProvider } from '@tanstack/react-query'

// A ligação de tempo real. Alterada nesta passagem para publicar o id do socket
// no cliente HTTP — é esse id que permite ao servidor excluir a origem quando
// difunde alterações de um roteiro, e sem ele quem edita recebe o eco do
// próprio evento.

/** Socket falso com um registo dos ouvintes, para o teste os poder disparar. */
function socketFalso() {
  const ouvintes = new Map<string, (...a: unknown[]) => void>()
  return {
    id: 'sock-1',
    connected: false,
    on: vi.fn((evento: string, fn: (...a: unknown[]) => void) => { ouvintes.set(evento, fn) }),
    off: vi.fn(),
    emit: vi.fn(),
    disconnect: vi.fn(),
    /** Dispara um evento como se viesse do servidor. */
    disparar(evento: string, ...args: unknown[]) { ouvintes.get(evento)?.(...args) },
    ouvintes,
  }
}

const estado = vi.hoisted(() => ({ socket: null as ReturnType<typeof socketFalso> | null }))
const io = vi.hoisted(() => vi.fn())
const setSocketId = vi.hoisted(() => vi.fn())
const auth = vi.hoisted(() => ({ valor: { accessToken: 'tok', user: { id: 'u1' } } }))

vi.mock('socket.io-client', () => ({ io }))
vi.mock('@/lib/api', () => ({ setSocketId, API_URL: 'http://api.test' }))
vi.mock('@/store/authStore', () => ({ useAuthStore: () => auth.valor }))

function montar() {
  const queryClient = criarQueryClient()
  const visto: { socket: unknown } = { socket: undefined }

  function Espia() {
    visto.socket = useSocket()
    return null
  }

  const r = render(
    <QueryClientProvider client={queryClient}>
      <SocketProvider><Espia /></SocketProvider>
    </QueryClientProvider>,
  )
  return { ...r, queryClient, visto }
}

beforeEach(() => {
  estado.socket = socketFalso()
  io.mockReset().mockImplementation(() => estado.socket)
  setSocketId.mockReset()
  auth.valor = { accessToken: 'tok', user: { id: 'u1' } }
})
afterEach(cleanup)

describe('abrir a ligação', () => {
  test('liga com o token no handshake', () => {
    montar()

    expect(io).toHaveBeenCalledTimes(1)
    expect(io.mock.calls[0][1]).toMatchObject({ auth: { token: 'tok' } })
  })

  test('sem sessão não liga nada', () => {
    // Abrir um socket sem token só serve para o servidor o recusar.
    auth.valor = { accessToken: null, user: null } as never
    montar()

    expect(io).not.toHaveBeenCalled()
  })

  test('o socket é exposto a quem o pedir', () => {
    // Foi por não estar exposto que o progresso da geração por IA nunca o
    // recebia: estava numa ref, e atribuir a uma ref não provoca re-render.
    const { visto } = montar()

    expect(visto.socket).toBe(estado.socket)
  })
})

describe('id do socket para o cliente HTTP', () => {
  test('publicado no connect, não antes', () => {
    // O id só existe depois do handshake. Publicá-lo à criação mandava
    // undefined no cabeçalho e o servidor não excluía ninguém.
    montar()
    expect(setSocketId).not.toHaveBeenCalledWith('sock-1')

    act(() => { estado.socket!.disparar('connect') })

    expect(setSocketId).toHaveBeenCalledWith('sock-1')
  })

  test('limpo no disconnect', () => {
    montar()
    act(() => { estado.socket!.disparar('connect') })
    setSocketId.mockClear()

    act(() => { estado.socket!.disparar('disconnect') })

    expect(setSocketId).toHaveBeenCalledWith(null)
  })

  test('limpo ao desmontar, junto com a ligação', () => {
    const { unmount } = montar()
    act(() => { estado.socket!.disparar('connect') })
    setSocketId.mockClear()

    unmount()

    expect(estado.socket!.disconnect).toHaveBeenCalled()
    expect(setSocketId).toHaveBeenCalledWith(null)
  })
})

describe('eventos do servidor', () => {
  test('new_notification invalida as notificações e a contagem', () => {
    const { queryClient } = montar()
    const invalidar = vi.spyOn(queryClient, 'invalidateQueries')

    act(() => { estado.socket!.disparar('new_notification') })

    const chaves = invalidar.mock.calls.map((c) => JSON.stringify(c[0]?.queryKey))
    expect(chaves).toContain(JSON.stringify(['notifications']))
    expect(chaves).toContain(JSON.stringify(['unread-notif-count']))
  })

  test('conversations:updated invalida a lista de conversas', () => {
    // É este o evento que mantém o badge de não lidas certo. Havia também um
    // `unread_messages`, que ninguém ouvia e cujo valor era só de uma conversa
    // apesar do nome; foi removido do servidor.
    const { queryClient } = montar()
    const invalidar = vi.spyOn(queryClient, 'invalidateQueries')

    act(() => { estado.socket!.disparar('conversations:updated') })

    const chaves = invalidar.mock.calls.map((c) => JSON.stringify(c[0]?.queryKey))
    expect(chaves).toContain(JSON.stringify(['conversations']))
  })

  test('escuta connect, disconnect e os dois eventos de dados', () => {
    montar()

    for (const evento of ['connect', 'disconnect', 'new_notification', 'conversations:updated']) {
      expect(estado.socket!.ouvintes.has(evento), `faltou o ouvinte de ${evento}`).toBe(true)
    }
  })
})

import { describe, test, expect, beforeEach, vi } from 'vitest'
import { api, ApiError, setAccessToken, getAccessToken, API_URL } from './api'
import { useAuthStore } from '@/store/authStore'

/** Constrói algo com a forma de Response, suficiente para o cliente. */
function res(status: number, body?: unknown, statusText = 'Status Text'): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText,
    json: async () => {
      if (body === undefined) throw new Error('sem corpo JSON')
      return body
    },
  } as unknown as Response
}

let fetchMock: ReturnType<typeof vi.fn>

beforeEach(() => {
  fetchMock = vi.fn()
  globalThis.fetch = fetchMock as unknown as typeof fetch
  setAccessToken(null)
  useAuthStore.setState({ user: null, accessToken: null, isHydrated: false })
})

describe('cabeçalhos do pedido', () => {
  test('envia Authorization quando há token', async () => {
    setAccessToken('token-abc')
    fetchMock.mockResolvedValueOnce(res(200, { ok: true }))

    await api.get('/feed')

    const [, init] = fetchMock.mock.calls[0]
    expect(init.headers.Authorization).toBe('Bearer token-abc')
  })

  test('omite Authorization quando não há token', async () => {
    fetchMock.mockResolvedValueOnce(res(200, {}))

    await api.get('/feed')

    const [, init] = fetchMock.mock.calls[0]
    expect(init.headers.Authorization).toBeUndefined()
  })

  test('só define Content-Type quando há corpo', async () => {
    fetchMock.mockResolvedValueOnce(res(200, {}))
    await api.get('/feed')
    expect(fetchMock.mock.calls[0][1].headers['Content-Type']).toBeUndefined()

    fetchMock.mockResolvedValueOnce(res(200, {}))
    await api.post('/posts', { texto: 'olá' })
    expect(fetchMock.mock.calls[1][1].headers['Content-Type']).toBe('application/json')
  })

  test('envia sempre credentials para os cookies de refresh viajarem', async () => {
    fetchMock.mockResolvedValueOnce(res(200, {}))
    await api.get('/feed')
    expect(fetchMock.mock.calls[0][1].credentials).toBe('include')
  })

  test('constrói o URL a partir de API_URL', async () => {
    fetchMock.mockResolvedValueOnce(res(200, {}))
    await api.get('/feed')
    expect(fetchMock.mock.calls[0][0]).toBe(`${API_URL}/feed`)
  })

  test('DELETE sem corpo não envia body', async () => {
    fetchMock.mockResolvedValueOnce(res(204))
    await api.delete('/posts/1')
    expect(fetchMock.mock.calls[0][1].body).toBeUndefined()
  })
})

describe('respostas com sucesso', () => {
  test('devolve o JSON do corpo', async () => {
    fetchMock.mockResolvedValueOnce(res(200, { id: 7, titulo: 'Lisboa' }))
    await expect(api.get('/itineraries/7')).resolves.toEqual({ id: 7, titulo: 'Lisboa' })
  })

  test('204 devolve undefined sem tentar ler JSON', async () => {
    fetchMock.mockResolvedValueOnce(res(204))
    await expect(api.delete('/posts/1')).resolves.toBeUndefined()
  })
})

describe('erros', () => {
  test('usa a mensagem do corpo quando existe', async () => {
    fetchMock.mockResolvedValueOnce(res(400, { message: 'Título obrigatório.' }))
    await expect(api.post('/itineraries', {})).rejects.toThrow('Título obrigatório.')
  })

  test('cai para statusText quando o corpo não é JSON', async () => {
    fetchMock.mockResolvedValueOnce(res(500, undefined, 'Internal Server Error'))
    await expect(api.get('/feed')).rejects.toThrow('Internal Server Error')
  })

  test('lança ApiError com o status', async () => {
    fetchMock.mockResolvedValueOnce(res(404, { message: 'Não encontrado.' }))
    await expect(api.get('/posts/999')).rejects.toBeInstanceOf(ApiError)
    fetchMock.mockResolvedValueOnce(res(404, { message: 'Não encontrado.' }))
    await api.get('/posts/999').catch((e) => expect(e.status).toBe(404))
  })
})

describe('refresh automático em 401', () => {
  test('renova o token e repete o pedido original', async () => {
    setAccessToken('token-expirado')
    fetchMock
      .mockResolvedValueOnce(res(401, { message: 'Token expirado.' }))
      .mockResolvedValueOnce(res(200, { accessToken: 'token-novo' }))  // /auth/refresh
      .mockResolvedValueOnce(res(200, { id: 1 }))                       // repetição

    await expect(api.get('/feed')).resolves.toEqual({ id: 1 })

    expect(fetchMock).toHaveBeenCalledTimes(3)
    expect(fetchMock.mock.calls[1][0]).toBe(`${API_URL}/auth/refresh`)
    expect(fetchMock.mock.calls[1][1].method).toBe('POST')
    // a repetição já leva o token novo
    expect(fetchMock.mock.calls[2][1].headers.Authorization).toBe('Bearer token-novo')
  })

  test('propaga o token novo para o cliente e para a store', async () => {
    setAccessToken('token-expirado')
    fetchMock
      .mockResolvedValueOnce(res(401, {}))
      .mockResolvedValueOnce(res(200, { accessToken: 'token-novo' }))
      .mockResolvedValueOnce(res(200, {}))

    await api.get('/feed')

    expect(getAccessToken()).toBe('token-novo')
    expect(useAuthStore.getState().accessToken).toBe('token-novo')
  })

  test('não repete indefinidamente — 401 na repetição lança', async () => {
    setAccessToken('token-expirado')
    fetchMock
      .mockResolvedValueOnce(res(401, {}))
      .mockResolvedValueOnce(res(200, { accessToken: 'token-novo' }))
      .mockResolvedValueOnce(res(401, { message: 'Ainda inválido.' }))

    await expect(api.get('/feed')).rejects.toThrow('Ainda inválido.')
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })

  test('refresh recusado propaga o erro original', async () => {
    setAccessToken('token-expirado')
    fetchMock
      .mockResolvedValueOnce(res(401, { message: 'Sessão inválida.' }))
      .mockResolvedValueOnce(res(401, {}))   // refresh recusado

    await expect(api.get('/feed')).rejects.toThrow('Sessão inválida.')
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  test('refresh que rebenta na rede não deixa a excepção escapar', async () => {
    setAccessToken('token-expirado')
    fetchMock
      .mockResolvedValueOnce(res(401, { message: 'Sessão inválida.' }))
      .mockRejectedValueOnce(new Error('rede em baixo'))

    await expect(api.get('/feed')).rejects.toThrow('Sessão inválida.')
  })

  test('outros 4xx não desencadeiam refresh', async () => {
    setAccessToken('token-valido')
    fetchMock.mockResolvedValueOnce(res(403, { message: 'Sem permissão.' }))

    await expect(api.get('/groups/1')).rejects.toThrow('Sem permissão.')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})

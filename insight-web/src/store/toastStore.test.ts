import { describe, test, expect, beforeEach } from 'vitest'
import { useToastStore, toast } from './toastStore'

beforeEach(() => {
  useToastStore.setState({ toasts: [] })
})

describe('useToastStore', () => {
  test('add devolve o id e guarda o toast', () => {
    const id = useToastStore.getState().add({ message: 'Guardado.', type: 'success' })
    const { toasts } = useToastStore.getState()

    expect(toasts).toHaveLength(1)
    expect(toasts[0].id).toBe(id)
    expect(toasts[0].message).toBe('Guardado.')
  })

  test('atribui ids distintos', () => {
    const a = useToastStore.getState().add({ message: 'um', type: 'info' })
    const b = useToastStore.getState().add({ message: 'dois', type: 'info' })
    expect(a).not.toBe(b)
  })

  test('preserva a ordem de chegada', () => {
    useToastStore.getState().add({ message: 'primeiro', type: 'info' })
    useToastStore.getState().add({ message: 'segundo', type: 'info' })
    expect(useToastStore.getState().toasts.map((t) => t.message)).toEqual(['primeiro', 'segundo'])
  })

  test('remove tira apenas o id indicado', () => {
    const a = useToastStore.getState().add({ message: 'fica', type: 'info' })
    const b = useToastStore.getState().add({ message: 'sai', type: 'info' })

    useToastStore.getState().remove(b)

    const { toasts } = useToastStore.getState()
    expect(toasts).toHaveLength(1)
    expect(toasts[0].id).toBe(a)
  })

  test('remove com id inexistente não altera nada', () => {
    useToastStore.getState().add({ message: 'fica', type: 'info' })
    useToastStore.getState().remove('id-que-nao-existe')
    expect(useToastStore.getState().toasts).toHaveLength(1)
  })

  test('clear esvazia tudo', () => {
    useToastStore.getState().add({ message: 'um', type: 'info' })
    useToastStore.getState().add({ message: 'dois', type: 'info' })
    useToastStore.getState().clear()
    expect(useToastStore.getState().toasts).toEqual([])
  })
})

describe('helper toast()', () => {
  test('assume tipo info e 4s por omissão', () => {
    toast('Mensagem simples.')
    const t = useToastStore.getState().toasts[0]
    expect(t.type).toBe('info')
    expect(t.duration).toBe(4000)
  })

  test('respeita as opções dadas', () => {
    toast('Falhou.', { type: 'error', duration: 10_000 })
    const t = useToastStore.getState().toasts[0]
    expect(t.type).toBe('error')
    expect(t.duration).toBe(10_000)
  })

  test('guarda a função de undo para o botão Anular', async () => {
    let chamado = false
    toast('Post apagado.', { type: 'success', undoFn: () => { chamado = true } })

    const t = useToastStore.getState().toasts[0]
    expect(t.undoFn).toBeTypeOf('function')

    await t.undoFn!()
    expect(chamado).toBe(true)
  })

  test('devolve o id para poder ser removido programaticamente', () => {
    const id = toast('Vai desaparecer.')
    useToastStore.getState().remove(id)
    expect(useToastStore.getState().toasts).toHaveLength(0)
  })
})

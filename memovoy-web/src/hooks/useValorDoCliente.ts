'use client'

import { useSyncExternalStore } from 'react'

// Ler localStorage, navigator ou window durante o render é impuro, e no
// servidor nem sequer existem. O padrão antigo — estado inicial neutro mais um
// useEffect a corrigi-lo — provoca renders em cascata, que é o que a regra
// react-hooks/set-state-in-effect assinala.
//
// useSyncExternalStore resolve-o: o React usa o snapshot do servidor durante a
// hidratação e passa ao do cliente logo a seguir, sem mismatch e sem efeito.

/** Estes valores não mudam depois da hidratação, por isso nunca há que notificar. */
function naoSubscreve() {
  return () => {}
}

/**
 * `false` no servidor e durante a hidratação, `true` a partir daí.
 * Substitui o clássico `const [mounted, setMounted] = useState(false)` com
 * `useEffect(() => setMounted(true), [])`.
 */
export function useEstaHidratado(): boolean {
  return useSyncExternalStore(naoSubscreve, () => true, () => false)
}

/**
 * Lê um valor que só existe no cliente.
 *
 * `ler` tem de devolver algo estável entre chamadas — o React compara com
 * Object.is e um objecto novo a cada chamada provoca um ciclo infinito de
 * renders. Usar para primitivos; para objectos, memorizar fora do componente.
 *
 * @param ler         Função executada no cliente (pode tocar em window/localStorage).
 * @param noServidor  Valor devolvido no servidor e durante a hidratação.
 */
export function useValorDoCliente<T>(ler: () => T, noServidor: T): T {
  return useSyncExternalStore(naoSubscreve, ler, () => noServidor)
}

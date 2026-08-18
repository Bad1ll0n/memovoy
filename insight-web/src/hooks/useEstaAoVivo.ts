'use client'

import { useSyncExternalStore } from 'react'

/** Um post conta como "ao vivo" durante as duas horas seguintes à publicação. */
export const JANELA_AO_VIVO_MS = 2 * 60 * 60 * 1000

/** De quanto em quanto tempo o relógio partilhado avança. */
const INTERVALO_MS = 60_000

// Relógio partilhado por todos os posts visíveis. Ler Date.now() durante o
// render é impuro — dois renders da mesma árvore podiam discordar — e o badge
// nunca desaparecia sozinho, só quando algo provocava novo render.
//
// O relógio só existe enquanto alguém precisa dele: arranca no primeiro
// subscritor e pára no último.
//
// O snapshot é o booleano, não o instante. É deliberado: o React compara o
// valor devolvido e desiste do re-render quando não muda, por isso o tique de
// cada minuto só custa um render aos posts que atravessam a fronteira das duas
// horas. Um feed de posts antigos não re-renderiza nada.

const ouvintes = new Set<() => void>()
let temporizador: ReturnType<typeof setInterval> | null = null
let agora = Date.now()

function subscrever(aoMudar: () => void) {
  // Refresca ao montar: sem isto um post publicado depois deste módulo ter sido
  // importado só apareceria como "ao vivo" no tique seguinte — até um minuto
  // depois, o que é precisamente quando o autor está a olhar para ele.
  agora = Date.now()
  ouvintes.add(aoMudar)

  if (temporizador === null) {
    temporizador = setInterval(() => {
      agora = Date.now()
      ouvintes.forEach((o) => o())
    }, INTERVALO_MS)
  }

  return () => {
    ouvintes.delete(aoMudar)
    if (ouvintes.size === 0 && temporizador !== null) {
      clearInterval(temporizador)
      temporizador = null
    }
  }
}

function dentroDaJanela(createdAt: string) {
  const decorrido = agora - new Date(createdAt).getTime()
  return decorrido >= 0 && decorrido < JANELA_AO_VIVO_MS
}

/**
 * Indica se um post ainda está dentro da janela "ao vivo", reavaliando à medida
 * que o tempo passa. Devolve false no render do servidor e na hidratação, onde
 * não há relógio — o badge aparece logo a seguir, se for caso disso.
 */
export function useEstaAoVivo(createdAt: string): boolean {
  return useSyncExternalStore(
    subscrever,
    () => dentroDaJanela(createdAt),
    () => false,
  )
}

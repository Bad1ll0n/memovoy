'use client'

import { useEffect, useRef } from 'react'

/**
 * Comportamento de teclado e foco que qualquer diálogo modal precisa de ter.
 *
 * Escrito primeiro dentro do ConfirmModal e extraído quando se viu que os
 * outros diálogos da app não tinham nada disto: o ReportModal e o
 * CreatePostModal abriam sem `role="dialog"` e sem saída pelo Escape — quem
 * navega por teclado ficava lá dentro sem forma de sair.
 *
 * Faz três coisas:
 *
 *   Escape fecha. Um modal sem saída pelo teclado é uma armadilha.
 *
 *   O Tab não sai da caixa. Um diálogo com `aria-modal="true"` anuncia aos
 *   leitores de ecrã que o resto da página está inerte; se o Tab saísse na
 *   mesma, a pessoa acabava a interagir com o que lhe foi dito inacessível.
 *
 *   O foco volta a quem abriu o diálogo. Sem isso fica no <body>, e a navegação
 *   por teclado recomeça do topo da página em vez de voltar ao botão premido.
 *
 * @param open   se o diálogo está visível
 * @param onClose  chamado no Escape
 * @param focoInicial  onde pôr o foco ao abrir. Sem isto vai para o primeiro
 *   focável da caixa, que raramente é o certo: num diálogo de confirmação é o
 *   X de fechar em vez do Cancelar, e num formulário é qualquer coisa menos o
 *   primeiro campo.
 * @returns ref a pôr no elemento que contém os controlos do diálogo
 */
export function useDialogoModal(
  open: boolean,
  onClose: () => void,
  focoInicial?: React.RefObject<HTMLElement | null>,
) {
  const caixaRef = useRef<HTMLDivElement>(null)
  const anteriorRef = useRef<HTMLElement | null>(null)

  // Guardar quem tinha o foco, e devolvê-lo ao fechar.
  useEffect(() => {
    if (!open) return

    anteriorRef.current = document.activeElement as HTMLElement | null

    const alvo = focoInicial?.current ?? caixaRef.current?.querySelector<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
    )
    alvo?.focus()

    return () => { anteriorRef.current?.focus?.() }
  }, [open, focoInicial])

  useEffect(() => {
    if (!open) return

    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        onClose()
        return
      }
      if (e.key !== 'Tab') return

      const caixa = caixaRef.current
      if (!caixa) return

      const focaveis = Array.from(
        caixa.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((el) => !el.hasAttribute('disabled'))

      if (focaveis.length === 0) return

      const primeiro = focaveis[0]
      const ultimo = focaveis[focaveis.length - 1]
      const activo = document.activeElement

      // O caso `!caixa.contains(activo)` cobre o foco ter escapado por outra
      // via — um clique no fundo, por exemplo. O Tab seguinte traz de volta.
      if (e.shiftKey && (activo === primeiro || !caixa.contains(activo))) {
        e.preventDefault()
        ultimo.focus()
      } else if (!e.shiftKey && (activo === ultimo || !caixa.contains(activo))) {
        e.preventDefault()
        primeiro.focus()
      }
    }

    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  return caixaRef
}

import { Spinner } from '@/components/ui/Spinner'

/**
 * Mostrado enquanto um segmento carrega. Sem isto, navegar para uma página
 * pesada deixava o ecrã anterior congelado sem sinal nenhum de que algo estava
 * a acontecer.
 */
export default function ACarregar() {
  return (
    <div className="flex justify-center py-20" role="status" aria-label="A carregar">
      <Spinner size="lg" />
    </div>
  )
}

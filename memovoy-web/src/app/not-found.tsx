import { ErroDePagina } from '@/components/ui/ErroDePagina'

export default function NaoEncontrado() {
  return (
    <ErroDePagina
      titulo="Esta página não existe"
      descricao="O endereço pode estar errado, ou o que procuravas foi entretanto removido."
    />
  )
}

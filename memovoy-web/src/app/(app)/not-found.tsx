import { ErroDePagina } from '@/components/ui/ErroDePagina'

export default function NaoEncontradoNaApp() {
  return (
    <ErroDePagina
      titulo="Não encontrámos isto"
      descricao="O roteiro, perfil ou publicação que procuravas pode ter sido removido."
    />
  )
}

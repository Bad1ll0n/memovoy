import Link from 'next/link'

export const metadata = { title: 'Termos de Serviço — Memovoy' }

export default function TermsPage() {
  return (
    <main className="min-h-screen py-12 px-4" style={{ background: 'var(--bg-body)', color: 'var(--text-primary)' }}>
      <div className="max-w-2xl mx-auto">
        <Link href="/" className="text-sm hover:underline mb-8 block" style={{ color: 'var(--text-muted)' }}>
          ← Voltar
        </Link>
        <h1 className="text-2xl font-bold mb-6">Termos de Serviço</h1>
        <div className="space-y-6 text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
          <section>
            <h2 className="font-semibold text-base mb-2" style={{ color: 'var(--text-primary)' }}>1. Aceitação</h2>
            <p>Ao usar o Memovoy, aceitas estes Termos de Serviço. Se não concordares, não utilizes a plataforma.</p>
          </section>
          <section>
            <h2 className="font-semibold text-base mb-2" style={{ color: 'var(--text-primary)' }}>2. Conta</h2>
            <p>És responsável pela segurança da tua conta e por todas as actividades que nela ocorram. Deves ter pelo menos 13 anos para usar o Memovoy.</p>
          </section>
          <section>
            <h2 className="font-semibold text-base mb-2" style={{ color: 'var(--text-primary)' }}>3. Conteúdo</h2>
            <p>Manténs a propriedade do conteúdo que publicas. Ao publicares, concedes ao Memovoy uma licença para exibir esse conteúdo na plataforma. Não publiques conteúdo ilegal, ofensivo ou que viole direitos de terceiros.</p>
          </section>
          <section>
            <h2 className="font-semibold text-base mb-2" style={{ color: 'var(--text-primary)' }}>4. Suspensão</h2>
            <p>Reservamo-nos o direito de suspender ou terminar contas que violem estes termos, sem aviso prévio.</p>
          </section>
          <section>
            <h2 className="font-semibold text-base mb-2" style={{ color: 'var(--text-primary)' }}>5. Alterações</h2>
            <p>Podemos actualizar estes termos periodicamente. O uso continuado da plataforma após as alterações implica aceitação dos novos termos.</p>
          </section>
          <section>
            <h2 className="font-semibold text-base mb-2" style={{ color: 'var(--text-primary)' }}>6. Contacto</h2>
            <p>Para questões sobre estes termos, contacta-nos através das definições da tua conta.</p>
          </section>
        </div>
        <p className="text-xs mt-10" style={{ color: 'var(--text-muted)' }}>Última actualização: Janeiro 2025</p>
      </div>
    </main>
  )
}

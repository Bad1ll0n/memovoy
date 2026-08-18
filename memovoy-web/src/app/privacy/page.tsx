import Link from 'next/link'

export const metadata = { title: 'Política de Privacidade — Memovoy' }

export default function PrivacyPage() {
  return (
    <main className="min-h-screen py-12 px-4" style={{ background: 'var(--bg-body)', color: 'var(--text-primary)' }}>
      <div className="max-w-2xl mx-auto">
        <Link href="/" className="text-sm hover:underline mb-8 block" style={{ color: 'var(--text-muted)' }}>
          ← Voltar
        </Link>
        <h1 className="text-2xl font-bold mb-6">Política de Privacidade</h1>
        <div className="space-y-6 text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
          <section>
            <h2 className="font-semibold text-base mb-2" style={{ color: 'var(--text-primary)' }}>1. Dados que recolhemos</h2>
            <p>Recolhemos dados que forneces ao criar a conta (email, username), conteúdo que publicas (posts, itinerários), e dados de uso da plataforma (páginas visitadas, interacções).</p>
          </section>
          <section>
            <h2 className="font-semibold text-base mb-2" style={{ color: 'var(--text-primary)' }}>2. Como usamos os dados</h2>
            <p>Usamos os teus dados para fornecer e melhorar o serviço, personalizar a tua experiência, e enviar notificações sobre actividade relevante para ti.</p>
          </section>
          <section>
            <h2 className="font-semibold text-base mb-2" style={{ color: 'var(--text-primary)' }}>3. Partilha de dados</h2>
            <p>Não vendemos os teus dados pessoais. Podemos partilhar dados com fornecedores de serviços que nos ajudam a operar a plataforma (ex: armazenamento de ficheiros), sempre sob acordos de confidencialidade.</p>
          </section>
          <section>
            <h2 className="font-semibold text-base mb-2" style={{ color: 'var(--text-primary)' }}>4. Os teus direitos</h2>
            <p>Tens o direito de aceder, corrigir ou eliminar os teus dados pessoais. Podes fazê-lo através das definições da conta ou contactando-nos directamente.</p>
          </section>
          <section>
            <h2 className="font-semibold text-base mb-2" style={{ color: 'var(--text-primary)' }}>5. Cookies</h2>
            <p>Usamos cookies essenciais para autenticação e sessão. Não usamos cookies de rastreamento ou publicidade.</p>
          </section>
          <section>
            <h2 className="font-semibold text-base mb-2" style={{ color: 'var(--text-primary)' }}>6. Segurança</h2>
            <p>Aplicamos medidas técnicas para proteger os teus dados, incluindo encriptação em trânsito e armazenamento seguro de credenciais.</p>
          </section>
        </div>
        <p className="text-xs mt-10" style={{ color: 'var(--text-muted)' }}>Última actualização: Janeiro 2025</p>
      </div>
    </main>
  )
}

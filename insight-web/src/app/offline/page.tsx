'use client'

export default function OfflinePage() {
  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center p-8 text-center"
      style={{ background: 'var(--bg-body)' }}
    >
      <div className="text-5xl mb-4">✈️</div>
      <h1 className="text-2xl font-bold mb-2" style={{ color: 'var(--text-primary)' }}>
        Sem ligação
      </h1>
      <p className="text-sm max-w-xs" style={{ color: 'var(--text-muted)' }}>
        Não conseguimos carregar esta página. Os roteiros que consultaste recentemente estão disponíveis offline.
      </p>
      <button
        onClick={() => window.history.back()}
        className="btn btn-primary mt-6"
      >
        Voltar
      </button>
    </div>
  )
}

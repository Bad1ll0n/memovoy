import { AlertCircle, Info, CheckCircle2 } from 'lucide-react'

export function AlertBanner({
  variant,
  message,
}: {
  variant: 'danger' | 'info' | 'success'
  message: string
}) {
  if (variant === 'success') {
    return (
      <div
        className="flex items-start gap-2 px-3 py-2.5 rounded-xl text-sm"
        // Tokens, não cores em código. Estava aqui #16a34a sobre um verde a
        // 10%, que dá 4,12:1 no tema escuro e 3,02 no claro — falha os dois. As
        // outras variantes já usavam classes com tokens; só esta é que não.
        style={{
          background: 'var(--success-subtle)',
          color: 'var(--success)',
          border: '1px solid color-mix(in srgb, var(--success) 25%, transparent)',
        }}
        role="alert"
      >
        <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
        <span>{message}</span>
      </div>
    )
  }

  return (
    <div className={variant === 'danger' ? 'alert-danger' : 'alert-info'} role="alert">
      {variant === 'danger' ? (
        <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
      ) : (
        <Info className="w-4 h-4 shrink-0 mt-0.5" />
      )}
      <span>{message}</span>
    </div>
  )
}

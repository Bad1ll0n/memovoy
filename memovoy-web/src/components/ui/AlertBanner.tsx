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
        style={{ background: 'rgba(34,197,94,0.1)', color: '#16a34a', border: '1px solid rgba(34,197,94,0.25)' }}
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

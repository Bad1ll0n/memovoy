'use client'

import Image from 'next/image'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ShieldCheck, ShieldOff, ChevronLeft, Copy, Check } from 'lucide-react'
import { api } from '@/lib/api'
import { useRequireAuth } from '@/hooks/useRequireAuth'
import { AlertBanner } from '@/components/ui/AlertBanner'
import { Spinner } from '@/components/ui/Spinner'

type Phase = 'idle' | 'setup' | 'confirm' | 'disable'

export default function SecuritySettingsPage() {
  const router = useRouter()
  const { isReady } = useRequireAuth()

  const [phase, setPhase]           = useState<Phase>('idle')
  const [secret, setSecret]         = useState('')
  const [qrUrl, setQrUrl]           = useState('')
  const [code, setCode]             = useState('')
  const [loading, setLoading]       = useState(false)
  const [error, setError]           = useState('')
  const [success, setSuccess]       = useState('')
  const [copied, setCopied]         = useState(false)

  async function startSetup() {
    setLoading(true)
    setError('')
    try {
      const { secret: s, qrCodeDataUrl } = await api.post<{ secret: string; qrCodeDataUrl: string }>('/auth/2fa/setup')
      setSecret(s)
      setQrUrl(qrCodeDataUrl)
      setPhase('setup')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao configurar 2FA.')
    } finally {
      setLoading(false)
    }
  }

  async function confirmSetup(e: React.FormEvent) {
    e.preventDefault()
    if (code.length !== 6) return
    setLoading(true)
    setError('')
    try {
      await api.post('/auth/2fa/confirm', { code })
      setSuccess('Autenticação de dois fatores ativada com sucesso!')
      setPhase('idle')
      setCode('')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Código inválido.')
    } finally {
      setLoading(false)
    }
  }

  async function disable2fa(e: React.FormEvent) {
    e.preventDefault()
    if (code.length !== 6) return
    setLoading(true)
    setError('')
    try {
      await api.delete('/auth/2fa', { code })
      setSuccess('Autenticação de dois fatores desativada.')
      setPhase('idle')
      setCode('')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Código inválido.')
    } finally {
      setLoading(false)
    }
  }

  function copySecret() {
    navigator.clipboard?.writeText(secret)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  if (!isReady) return <div className="flex justify-center py-12"><Spinner size="lg" /></div>

  return (
    <div>
      <button
        onClick={() => phase !== 'idle' ? setPhase('idle') : router.back()}
        className="flex items-center gap-1.5 text-sm mb-5 hover:opacity-70 transition-opacity"
        style={{ color: 'var(--text-muted)' }}
      >
        <ChevronLeft className="w-4 h-4" />
        {phase !== 'idle' ? 'Cancelar' : 'Definições'}
      </button>

      <h1 className="text-xl font-bold mb-5" style={{ color: 'var(--text-primary)' }}>
        Segurança
      </h1>

      {success && (
        <div className="mb-4">
          <AlertBanner variant="success" message={success} />
        </div>
      )}

      {/* 2FA Card */}
      <div className="card p-5 mb-4">
        <div className="flex items-start gap-3 mb-4">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
            style={{ background: 'rgba(34,152,206,0.12)' }}
          >
            <ShieldCheck className="w-5 h-5" style={{ color: 'var(--accent)' }} />
          </div>
          <div>
            <p className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>
              Autenticação de dois fatores (2FA)
            </p>
            <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>
              Protege a tua conta com um código gerado pela app autenticadora.
            </p>
          </div>
        </div>

        {error && <div className="mb-3"><AlertBanner variant="danger" message={error} /></div>}

        {phase === 'idle' && (
          <div className="flex gap-2">
            <button
              onClick={startSetup}
              disabled={loading}
              className="btn btn-primary text-sm gap-1.5"
            >
              {loading ? <Spinner size="sm" /> : <ShieldCheck className="w-3.5 h-3.5" />}
              Activar 2FA
            </button>
            <button
              onClick={() => { setPhase('disable'); setCode('') }}
              className="btn btn-secondary text-sm gap-1.5"
              style={{ color: 'var(--text-secondary)' }}
            >
              <ShieldOff className="w-3.5 h-3.5" />
              Desactivar
            </button>
          </div>
        )}

        {phase === 'setup' && (
          <div className="space-y-4">
            <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
              Digitaliza o QR code com a tua app autenticadora (Google Authenticator, Authy, etc.)
              ou introduz o código manualmente.
            </p>

            {qrUrl && (
              <div className="flex justify-center">
                <div
                  className="p-3 rounded-xl"
                  style={{ background: '#fff', display: 'inline-block' }}
                >
                  <Image src={qrUrl} alt="QR Code 2FA" width={180} height={180} unoptimized />
                </div>
              </div>
            )}

            <div>
              <p className="text-xs font-medium mb-1" style={{ color: 'var(--text-muted)' }}>
                Código manual
              </p>
              <div
                className="flex items-center gap-2 px-3 py-2 rounded-xl"
                style={{ background: 'var(--surface2)', border: '1px solid var(--border)' }}
              >
                <code className="flex-1 text-sm font-mono tracking-widest" style={{ color: 'var(--text-primary)' }}>
                  {secret}
                </code>
                <button
                  onClick={copySecret}
                  className="shrink-0 hover:opacity-70 transition-opacity"
                  style={{ color: 'var(--accent)' }}
                  aria-label="Copiar código"
                >
                  {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <button
              onClick={() => setPhase('confirm')}
              className="btn btn-primary w-full text-sm"
            >
              Já adicionei — confirmar
            </button>
          </div>
        )}

        {phase === 'confirm' && (
          <form onSubmit={confirmSetup} className="space-y-3">
            <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
              Introduz o código de 6 dígitos gerado pela tua app para confirmar.
            </p>
            <input
              type="text"
              inputMode="numeric"
              maxLength={6}
              autoComplete="one-time-code"
              className="input text-center text-xl tracking-widest font-mono"
              placeholder="000000"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
              autoFocus
            />
            <button
              type="submit"
              disabled={code.length !== 6 || loading}
              className="btn btn-primary w-full text-sm"
            >
              {loading ? <Spinner size="sm" /> : 'Activar 2FA'}
            </button>
          </form>
        )}

        {phase === 'disable' && (
          <form onSubmit={disable2fa} className="space-y-3">
            <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
              Introduz o código da tua app autenticadora para desactivar o 2FA.
            </p>
            <input
              type="text"
              inputMode="numeric"
              maxLength={6}
              autoComplete="one-time-code"
              className="input text-center text-xl tracking-widest font-mono"
              placeholder="000000"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
              autoFocus
            />
            <button
              type="submit"
              disabled={code.length !== 6 || loading}
              className="btn text-sm w-full"
              style={{ background: 'var(--danger)', color: '#fff' }}
            >
              {loading ? <Spinner size="sm" /> : 'Desactivar 2FA'}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}

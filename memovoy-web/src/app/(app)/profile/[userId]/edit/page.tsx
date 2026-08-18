'use client'

import Image from 'next/image'
import { useState, useRef } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { Camera, ArrowLeft, Save, ImagePlus, MapPin, Globe2 } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { useRequireAuth } from '@/hooks/useRequireAuth'
import { useAuthStore } from '@/store/authStore'
import { Avatar } from '@/components/ui/Avatar'
import { Spinner } from '@/components/ui/Spinner'
import { AlertBanner } from '@/components/ui/AlertBanner'
import type { AuthUser } from '@/store/authStore'

export default function EditProfilePage() {
  const { userId } = useParams<{ userId: string }>()
  const router = useRouter()
  const { isReady, user } = useRequireAuth()
  const { setAuth, accessToken } = useAuthStore()
  const qc = useQueryClient()

  const [displayName, setDisplayName]   = useState('')
  const [bio, setBio]                   = useState('')
  const [location, setLocation]         = useState('')
  const [website, setWebsite]           = useState('')
  const [uploading, setUploading]           = useState(false)
  const [uploadingCover, setUploadingCover] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState('')
  const [avatarPreview, setAvatarPreview]   = useState<string | null>(null)
  const [coverPreview, setCoverPreview]     = useState<string | null>(null)
  const fileRef  = useRef<HTMLInputElement>(null)
  const coverRef = useRef<HTMLInputElement>(null)

  const [initialised, setInitialised] = useState(false)
  if (isReady && !initialised) {
    setDisplayName(user?.displayName ?? '')
    setBio(user?.bio ?? '')
    setLocation(user?.location ?? '')
    setWebsite(user?.website ?? '')
    setInitialised(true)
  }

  async function handleAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const preview = URL.createObjectURL(file)
    setAvatarPreview(preview)
    setUploading(true)
    setError('')
    try {
      const { publicUrl } = await api.uploadFile<{ publicUrl: string; key: string }>('/uploads/image', file)
      const { user: updated } = await api.patch<{ user: AuthUser }>('/users/me', { avatarUrl: publicUrl })
      setAuth(updated, accessToken!)
      qc.invalidateQueries({ queryKey: ['profile', userId] })
    } catch (err: unknown) {
      setAvatarPreview(null)
      setError(err instanceof Error ? err.message : 'Erro ao carregar imagem.')
    } finally {
      setUploading(false)
      URL.revokeObjectURL(preview)
    }
  }

  async function handleCoverChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const preview = URL.createObjectURL(file)
    setCoverPreview(preview)
    setUploadingCover(true)
    setError('')
    try {
      const { publicUrl } = await api.uploadFile<{ publicUrl: string; key: string }>('/uploads/image', file)
      const { user: updated } = await api.patch<{ user: AuthUser }>('/users/me', { coverUrl: publicUrl })
      setAuth(updated, accessToken!)
      qc.invalidateQueries({ queryKey: ['profile', userId] })
    } catch (err: unknown) {
      setCoverPreview(null)
      setError(err instanceof Error ? err.message : 'Erro ao carregar capa.')
    } finally {
      setUploadingCover(false)
      URL.revokeObjectURL(preview)
    }
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError('')
    try {
      const { user: updated } = await api.patch<{ user: AuthUser }>('/users/me', {
        displayName: displayName.trim(),
        bio: bio.trim(),
        location: location.trim() || null,
        website: website.trim() || null,
      })
      setAuth(updated, accessToken!)
      qc.invalidateQueries({ queryKey: ['profile', userId] })
      router.push(`/profile/${userId}`)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao guardar.')
    } finally {
      setSaving(false)
    }
  }

  if (!isReady) {
    return (
      <div className="flex justify-center py-12">
        <Spinner size="lg" />
      </div>
    )
  }

  if (user?.id !== userId) {
    router.replace(`/profile/${userId}`)
    return null
  }

  return (
    <div>
      <button
        onClick={() => router.back()}
        className="flex items-center gap-2 mb-5 text-sm hover:opacity-80 transition-opacity"
        style={{ color: 'var(--text-muted)' }}
      >
        <ArrowLeft className="w-4 h-4" />
        Voltar
      </button>

      <h1 className="text-xl font-bold mb-6" style={{ color: 'var(--text-primary)' }}>
        Editar perfil
      </h1>

      {error && (
        <div className="mb-4">
          <AlertBanner variant="danger" message={error} />
        </div>
      )}

      <form onSubmit={handleSave} className="space-y-5">
        {/* Cover photo */}
        <div>
          <label className="label mb-2">Foto de capa</label>
          <div
            className="relative rounded-xl overflow-hidden mb-2"
            style={{ height: 120, background: 'linear-gradient(135deg, #b87200, var(--accent))' }}
          >
            {(coverPreview ?? user.coverUrl) && (
              <Image
                src={coverPreview ?? user.coverUrl!}
                alt="Capa"
                fill
                className="object-cover"
                unoptimized
              />
            )}
            <button
              type="button"
              onClick={() => coverRef.current?.click()}
              disabled={uploadingCover}
              className="absolute inset-0 flex items-center justify-center gap-2 text-white text-sm font-medium transition-opacity hover:opacity-80"
              style={{ background: 'rgba(0,0,0,0.35)' }}
            >
              {uploadingCover ? (
                <Spinner size="sm" />
              ) : (
                <>
                  <ImagePlus className="w-4 h-4" />
                  Alterar capa
                </>
              )}
            </button>
          </div>
          <input
            ref={coverRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleCoverChange}
          />
        </div>

        {/* Avatar */}
        <div className="flex flex-col items-center gap-3">
          <div className="relative">
            <Avatar src={avatarPreview ?? user.avatarUrl} name={user.displayName || user.username} size="xl" />
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              className="absolute -bottom-1 -right-1 w-8 h-8 rounded-full flex items-center justify-center border-2 transition-opacity hover:opacity-80"
              style={{ background: 'var(--accent)', borderColor: 'var(--bg-body)' }}
              aria-label="Alterar foto"
            >
              {uploading ? (
                <Spinner size="sm" />
              ) : (
                <Camera className="w-3.5 h-3.5" style={{ color: '#000' }} />
              )}
            </button>
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleAvatarChange}
          />
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
            Clica no ícone para alterar o avatar
          </p>
        </div>

        {/* Display name */}
        <div>
          <label className="label">Nome de apresentação</label>
          <input
            type="text"
            className="input"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            maxLength={50}
            placeholder="O teu nome"
          />
        </div>

        {/* Username (read-only) */}
        <div>
          <label className="label">Nome de utilizador</label>
          <input
            type="text"
            className="input opacity-60"
            value={`@${user.username}`}
            readOnly
            disabled
          />
          <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
            O nome de utilizador não pode ser alterado.
          </p>
        </div>

        {/* Location */}
        <div>
          <label className="label">Localização</label>
          <div className="relative">
            <MapPin
              className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none"
              style={{ color: 'var(--text-muted)' }}
            />
            <input
              type="text"
              className="input" style={{ paddingLeft: '2.25rem' }}
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              maxLength={100}
              placeholder="Ex: Lisboa, Portugal"
            />
          </div>
        </div>

        {/* Website */}
        <div>
          <label className="label">Website</label>
          <div className="relative">
            <Globe2
              className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none"
              style={{ color: 'var(--text-muted)' }}
            />
            <input
              type="url"
              className="input" style={{ paddingLeft: '2.25rem' }}
              value={website}
              onChange={(e) => setWebsite(e.target.value)}
              maxLength={300}
              placeholder="https://o-teu-site.com"
            />
          </div>
        </div>

        {/* Bio */}
        <div>
          <label className="label">Biografia</label>
          <textarea
            className="input resize-none"
            rows={4}
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            maxLength={300}
            placeholder="Conta algo sobre ti…"
          />
          <p className="text-xs mt-1 text-right" style={{ color: 'var(--text-muted)' }}>
            {bio.length}/300
          </p>
        </div>

        <button type="submit" disabled={saving} className="btn btn-primary w-full gap-2">
          {saving ? <Spinner size="sm" /> : <Save className="w-4 h-4" />}
          Guardar alterações
        </button>
      </form>
    </div>
  )
}

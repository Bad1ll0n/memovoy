'use client'

import { useState, useRef } from 'react'
import Image from 'next/image'
import { X, ImagePlus, MapPin, Send, Sparkles, Video, Map, ChevronDown, Check, ScanSearch } from 'lucide-react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, getAccessToken, API_URL } from '@/lib/api'
import { useAuthStore } from '@/store/authStore'
import { Avatar } from '@/components/ui/Avatar'
import { Spinner } from '@/components/ui/Spinner'
import { useDialogoModal } from '@/hooks/useDialogoModal'
import { AlertBanner } from '@/components/ui/AlertBanner'

interface ItinerarySummary {
  id: string
  title: string
  destination: string
  startDate: string | null
  endDate: string | null
  coverUrl: string | null
  daysCount: number
}

interface Props {
  onClose: () => void
  initialDestination?: string
}

async function uploadFileWithProgress(
  file: File,
  onProgress: (pct: number) => void,
): Promise<string> {
  const { uploadUrl, publicUrl } = await api.post<{ uploadUrl: string; publicUrl: string; key: string }>(
    '/uploads/presign',
    { filename: file.name, contentType: file.type, size: file.size },
  )

  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('PUT', uploadUrl)
    xhr.setRequestHeader('Content-Type', file.type)
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100))
    }
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve()
      else reject(new Error(`Upload falhou (${xhr.status}).`))
    }
    xhr.onerror = () => reject(new Error('Erro de rede durante o upload.'))
    xhr.send(file)
  })

  return publicUrl
}

export function CreatePostModal({ onClose, initialDestination }: Props) {
  // Sempre aberto enquanto está montado — quem o mostra é o pai, condicionalmente.
  const caixaRef = useDialogoModal(true, onClose)

  const { user } = useAuthStore()
  const qc = useQueryClient()
  const fileRef = useRef<HTMLInputElement>(null)

  const [previews, setPreviews] = useState<{ file: File; objectUrl: string }[]>([])
  const [caption, setCaption] = useState('')
  const [destination, setDestination] = useState(initialDestination ?? '')
  const [error, setError] = useState('')
  const [captionAiLoading, setCaptionAiLoading] = useState(false)
  const [captionAviso, setCaptionAviso] = useState<string | null>(null)
  const [selectedItineraryId, setSelectedItineraryId] = useState<string | null>(null)
  const [showItineraryPicker, setShowItineraryPicker] = useState(false)
  const [uploadProgress, setUploadProgress] = useState<number | null>(null)
  const [detectingDest, setDetectingDest] = useState(false)
  const [detectedHint, setDetectedHint] = useState<string | null>(null)

  const { data: itineraries } = useQuery<ItinerarySummary[]>({
    queryKey: ['my-itineraries-picker', user?.id],
    queryFn: async () => {
      const res = await api.get<{ itineraries: ItinerarySummary[] }>(`/users/${user!.id}/itineraries`)
      return res.itineraries ?? []
    },
    enabled: !!user?.id,
    staleTime: 60_000,
  })

  const postMutation = useMutation({
    mutationFn: async () => {
      setError('')
      if (previews.length === 0 && !caption.trim()) {
        throw new Error('Adiciona uma foto ou legenda.')
      }

      // Upload all files sequentially, tracking overall progress
      const imageUrls: string[] = []
      const total = previews.length
      for (let i = 0; i < total; i++) {
        const { file } = previews[i]
        const url = await uploadFileWithProgress(file, (pct) => {
          setUploadProgress(Math.round(((i + pct / 100) / total) * 100))
        })
        imageUrls.push(url)
      }
      setUploadProgress(null)

      return api.post('/posts', {
        caption:      caption.trim(),
        images:       imageUrls,
        destination:  destination.trim() || undefined,
        itineraryId:  selectedItineraryId ?? undefined,
      })
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['feed'] })
      qc.invalidateQueries({ queryKey: ['profile-posts'] })
      previews.forEach((p) => URL.revokeObjectURL(p.objectUrl))
      onClose()
    },
    onError: (err: unknown) => {
      setUploadProgress(null)
      setError(err instanceof Error ? err.message : 'Erro ao publicar post.')
    },
  })

  async function handleSuggestCaption() {
    if (!destination.trim()) return
    setCaptionAiLoading(true)
    setCaptionAviso(null)
    setCaption('')
    try {
      const res = await fetch(`${API_URL}/posts/suggest-caption/stream`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(getAccessToken() ? { Authorization: `Bearer ${getAccessToken()}` } : {}),
        },
        body: JSON.stringify({ destination: destination.trim(), images: [] }),
      })
      if (!res.ok || !res.body) throw new Error()

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buf = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buf += decoder.decode(value, { stream: true })
        const lines = buf.split('\n')
        buf = lines.pop() ?? ''
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          const payload = line.slice(6)
          if (payload === '[DONE]') break
          try {
            const { t, error: err, incompleta } = JSON.parse(payload)
            // O servidor distingue "falhou" de "ficou a meio". Uma legenda
            // cortada no limite de tokens acaba a meio da frase, e sem isto
            // aparecia na caixa como se estivesse pronta a publicar.
            if (incompleta) { setCaptionAviso('A sugestão ficou a meio. Acaba a frase ou pede outra.'); break }
            if (err) { setCaptionAviso('Não foi possível sugerir uma legenda. Tenta outra vez.'); break }
            if (t) setCaption((prev) => prev + t)
          } catch { /* skip malformed chunk */ }
        }
      }
    } catch {
      /* silently ignore — user can retry */
    } finally {
      setCaptionAiLoading(false)
    }
  }

  async function handleDetectDestination() {
    const firstImage = previews.find((p) => p.file.type.startsWith('image/'))
    if (!firstImage) return
    setDetectingDest(true)
    setDetectedHint(null)
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(reader.result as string)
        reader.onerror = reject
        reader.readAsDataURL(firstImage.file)
      })
      const result = await api.post<{ destination: string | null; country: string | null; confidence: string }>(
        '/uploads/recognize-destination',
        { imageUrl: dataUrl },
      )
      if (result.destination) {
        const suggestion = result.country ? `${result.destination}, ${result.country}` : result.destination
        setDestination(suggestion)
        setDetectedHint(`Detetado com confiança ${result.confidence === 'high' ? 'alta' : result.confidence === 'medium' ? 'média' : 'baixa'}`)
      } else {
        setDetectedHint('Não foi possível identificar o destino nesta foto.')
      }
    } catch {
      setDetectedHint('Erro ao analisar a imagem.')
    } finally {
      setDetectingDest(false)
    }
  }

  function handleFiles(files: FileList | null) {
    if (!files) return
    const remaining = 10 - previews.length
    const toAdd = Array.from(files).slice(0, remaining).filter((f) =>
      f.type.startsWith('image/') || f.type.startsWith('video/'),
    )
    const newPreviews = toAdd.map((file) => ({ file, objectUrl: URL.createObjectURL(file) }))
    setPreviews((prev) => [...prev, ...newPreviews])
  }

  function removeImage(idx: number) {
    setPreviews((prev) => {
      URL.revokeObjectURL(prev[idx].objectUrl)
      return prev.filter((_, i) => i !== idx)
    })
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.7)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
      role="dialog"
      aria-modal="true"
      aria-label="Criar publicação"
    >
      <div
        ref={caixaRef}
        className="card w-full max-w-lg max-h-[90vh] overflow-y-auto animate-fade-in"
        style={{ borderRadius: 20, display: 'flex', flexDirection: 'column' }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-4 py-3 shrink-0"
          style={{ borderBottom: '1px solid var(--border)' }}
        >
          <h2 className="font-bold text-base" style={{ color: 'var(--text-primary)' }}>
            Novo post
          </h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:opacity-70 transition-opacity"
            style={{ color: 'var(--text-muted)' }}
            aria-label="Fechar"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-4 flex flex-col gap-4 flex-1">
          {error && <AlertBanner variant="danger" message={error} />}

          {/* User + caption */}
          <div className="flex gap-3">
            <Avatar
              src={user?.avatarUrl ?? null}
              name={user?.displayName || user?.username || '?'}
              size="md"
            />
            <div className="flex-1 flex flex-col gap-1.5">
              <textarea
                className="resize-none bg-transparent text-sm outline-none w-full"
                style={{ color: 'var(--text-primary)', minHeight: 80 }}
                placeholder="Partilha a tua aventura…"
                value={caption}
                onChange={(e) => setCaption(e.target.value)}
                maxLength={2200}
                autoFocus
              />
              <div className="flex justify-between items-center gap-2">
                {captionAviso ? (
                  <p className="text-xs pl-1" style={{ color: 'var(--text-muted)' }}>{captionAviso}</p>
                ) : <span />}
                <button
                  type="button"
                  onClick={handleSuggestCaption}
                  disabled={captionAiLoading || !destination.trim()}
                  className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-lg transition-opacity hover:opacity-80 disabled:opacity-40"
                  style={{ background: 'var(--surface2)', color: 'var(--accent)' }}
                  title={destination.trim() ? 'Sugerir legenda com IA' : 'Adiciona um destino primeiro'}
                >
                  {captionAiLoading ? <Spinner size="sm" /> : <Sparkles className="w-3 h-3" />}
                  Sugerir com IA
                </button>
              </div>
            </div>
          </div>

          {/* Image previews */}
          {previews.length > 0 && (
            <div
              className="grid gap-1.5 rounded-xl overflow-hidden"
              style={{
                gridTemplateColumns: previews.length === 1 ? '1fr' : 'repeat(3, 1fr)',
              }}
            >
              {previews.map(({ file, objectUrl }, i) => (
                <div
                  key={i}
                  className="relative group overflow-hidden rounded-lg"
                  style={{ aspectRatio: previews.length === 1 ? (file.type.startsWith('video/') ? '16/9' : '4/5') : '1/1' }}
                >
                  {file.type.startsWith('video/') ? (
                    <video
                      src={objectUrl}
                      className="w-full h-full object-cover"
                      muted
                      preload="metadata"
                    />
                  ) : (
                  <Image
                    src={objectUrl}
                    alt={`Imagem ${i + 1}`}
                    fill
                    className="object-cover"
                    unoptimized
                  />
                  )}
                  {file.type.startsWith('video/') && (
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                      <Video className="w-8 h-8 text-white opacity-80" />
                    </div>
                  )}
                  <button
                    onClick={() => removeImage(i)}
                    className="absolute top-1 right-1 w-6 h-6 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                    style={{ background: 'rgba(0,0,0,0.6)' }}
                    aria-label="Remover"
                  >
                    <X className="w-3.5 h-3.5 text-white" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Add more photos */}
          {previews.length < 10 && (
            <>
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="flex items-center gap-2 text-sm hover:opacity-80 transition-opacity"
                style={{ color: 'var(--accent)' }}
              >
                <ImagePlus className="w-4 h-4" />
                {previews.length === 0 ? 'Adicionar fotos' : `Adicionar mais (${10 - previews.length} restantes)`}
              </button>
              <input
                ref={fileRef}
                type="file"
                accept="image/*,video/mp4,video/webm,video/quicktime"
                multiple
                className="hidden"
                onChange={(e) => handleFiles(e.target.files)}
              />
            </>
          )}

          {/* Destination */}
          <div className="flex flex-col gap-1">
            <div className="relative flex items-center gap-2">
              <div className="relative flex-1">
                <MapPin
                  className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4"
                  style={{ color: 'var(--text-muted)' }}
                />
                <input
                  type="text"
                  className="input text-sm" style={{ paddingLeft: '2.25rem' }}
                  placeholder="Adicionar destino (opcional)"
                  value={destination}
                  onChange={(e) => { setDestination(e.target.value); setDetectedHint(null) }}
                  maxLength={100}
                />
              </div>
              {previews.some((p) => p.file.type.startsWith('image/')) && (
                <button
                  type="button"
                  onClick={handleDetectDestination}
                  disabled={detectingDest}
                  title="Identificar destino com IA a partir da foto"
                  className="flex items-center gap-1 text-xs px-2.5 py-2 rounded-lg shrink-0 transition-opacity hover:opacity-80 disabled:opacity-40"
                  style={{ background: 'var(--surface2)', color: 'var(--accent)', border: '1px solid var(--border)' }}
                >
                  {detectingDest ? <Spinner size="sm" /> : <ScanSearch className="w-3.5 h-3.5" />}
                  {detectingDest ? '' : 'IA'}
                </button>
              )}
            </div>
            {detectedHint && (
              <p className="text-xs pl-1" style={{ color: detectedHint.startsWith('Detet') ? 'var(--success)' : 'var(--text-muted)' }}>
                {detectedHint}
              </p>
            )}
          </div>

          {/* Itinerary picker */}
          {itineraries && itineraries.length > 0 && (
            <div>
              <button
                type="button"
                onClick={() => setShowItineraryPicker((v) => !v)}
                className="flex items-center gap-2 text-sm w-full hover:opacity-80 transition-opacity"
                style={{ color: selectedItineraryId ? 'var(--accent)' : 'var(--text-secondary)' }}
              >
                <Map className="w-4 h-4 shrink-0" />
                <span className="flex-1 text-left">
                  {selectedItineraryId
                    ? (itineraries.find((i) => i.id === selectedItineraryId)?.title ?? 'Roteiro ligado')
                    : 'Ligar roteiro (opcional)'}
                </span>
                <ChevronDown
                  className="w-4 h-4 shrink-0 transition-transform"
                  style={{ transform: showItineraryPicker ? 'rotate(180deg)' : 'none' }}
                />
              </button>

              {showItineraryPicker && (
                <div
                  className="mt-2 rounded-xl overflow-hidden"
                  style={{ border: '1px solid var(--border)' }}
                >
                  {/* Deselect option */}
                  {selectedItineraryId && (
                    <button
                      type="button"
                      onClick={() => { setSelectedItineraryId(null); setShowItineraryPicker(false) }}
                      className="w-full flex items-center gap-2.5 px-3 py-2 text-sm hover:opacity-80 transition-opacity"
                      style={{ borderBottom: '1px solid var(--border)', color: 'var(--text-muted)' }}
                    >
                      <X className="w-3.5 h-3.5" />
                      Remover roteiro
                    </button>
                  )}
                  <div className="max-h-52 overflow-y-auto">
                    {itineraries.map((iti) => {
                      const isSelected = selectedItineraryId === iti.id
                      return (
                        <button
                          key={iti.id}
                          type="button"
                          onClick={() => { setSelectedItineraryId(iti.id); setShowItineraryPicker(false) }}
                          className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:opacity-80 transition-opacity"
                          style={{
                            background: isSelected ? 'rgba(201,243,29,0.08)' : 'transparent',
                            borderBottom: '1px solid var(--border)',
                          }}
                        >
                          {iti.coverUrl ? (
                            <div className="relative w-9 h-9 shrink-0 rounded-lg overflow-hidden">
                              <Image src={iti.coverUrl} alt={iti.title} fill className="object-cover" sizes="36px" unoptimized />
                            </div>
                          ) : (
                            <div
                              className="w-9 h-9 shrink-0 rounded-lg flex items-center justify-center"
                              style={{ background: 'rgba(201,243,29,0.12)' }}
                            >
                              <Map className="w-4 h-4" style={{ color: 'var(--accent)' }} />
                            </div>
                          )}
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>
                              {iti.title}
                            </p>
                            <p className="text-xs truncate" style={{ color: 'var(--text-muted)' }}>
                              {iti.destination}
                              {iti.daysCount > 0 && ` · ${iti.daysCount} dias`}
                            </p>
                          </div>
                          {isSelected && <Check className="w-4 h-4 shrink-0" style={{ color: 'var(--accent)' }} />}
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Upload progress bar */}
        {uploadProgress !== null && (
          <div className="px-4 pb-1 shrink-0">
            <div
              className="w-full rounded-full overflow-hidden"
              style={{ height: 3, background: 'var(--border)' }}
            >
              <div
                className="h-full rounded-full transition-all duration-200"
                style={{ width: `${uploadProgress}%`, background: 'var(--accent)' }}
              />
            </div>
            <p className="text-[10px] mt-1 text-right" style={{ color: 'var(--text-muted)' }}>
              A carregar… {uploadProgress}%
            </p>
          </div>
        )}

        {/* Footer */}
        <div
          className="px-4 py-3 shrink-0 flex justify-between items-center"
          style={{ borderTop: '1px solid var(--border)' }}
        >
          <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
            {caption.length}/2200
          </span>
          <button
            onClick={() => postMutation.mutate()}
            disabled={postMutation.isPending || (previews.length === 0 && !caption.trim())}
            className="btn btn-primary gap-2 text-sm"
          >
            {postMutation.isPending ? (
              <Spinner size="sm" />
            ) : (
              <Send className="w-4 h-4" />
            )}
            Publicar
          </button>
        </div>
      </div>
    </div>
  )
}

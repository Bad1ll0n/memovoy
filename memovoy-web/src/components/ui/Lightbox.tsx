'use client'

import { useEffect, useCallback, useState } from 'react'
import { createPortal } from 'react-dom'
import Image from 'next/image'
import { X, ChevronLeft, ChevronRight } from 'lucide-react'
import { useEstaHidratado } from '@/hooks/useValorDoCliente'

interface Props {
  images: string[]
  initialIndex?: number
  onClose: () => void
}

export function Lightbox({ images, initialIndex = 0, onClose }: Props) {
  const [current, setCurrent] = useState(initialIndex)
  // O portal precisa do document, que não existe no servidor.
  const mounted = useEstaHidratado()

  // Touch/swipe state
  const [touchStartX, setTouchStartX] = useState<number | null>(null)

  const prev = useCallback(() => setCurrent((c) => (c - 1 + images.length) % images.length), [images.length])
  const next = useCallback(() => setCurrent((c) => (c + 1) % images.length), [images.length])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
      if (e.key === 'ArrowLeft')  prev()
      if (e.key === 'ArrowRight') next()
    }
    window.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [onClose, prev, next])

  if (!mounted) return null

  const content = (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.93)', backdropFilter: 'blur(4px)' }}
      onClick={onClose}
    >
      {/* Close */}
      <button
        onClick={onClose}
        className="absolute top-4 right-4 p-2 rounded-full hover:opacity-70 transition-opacity"
        style={{ background: 'rgba(255,255,255,0.1)', color: '#fff' }}
        aria-label="Fechar"
      >
        <X className="w-5 h-5" />
      </button>

      {/* Prev */}
      {images.length > 1 && (
        <button
          onClick={(e) => { e.stopPropagation(); prev() }}
          className="absolute left-3 p-2 rounded-full hover:opacity-70 transition-opacity"
          style={{ background: 'rgba(255,255,255,0.1)', color: '#fff' }}
          aria-label="Anterior"
        >
          <ChevronLeft className="w-6 h-6" />
        </button>
      )}

      {/* Image */}
      <div
        className="relative"
        style={{ maxWidth: '92vw', maxHeight: '90vh', width: '100%', height: '100%' }}
        onClick={(e) => e.stopPropagation()}
        onTouchStart={(e) => setTouchStartX(e.touches[0].clientX)}
        onTouchEnd={(e) => {
          if (touchStartX === null) return
          const dx = e.changedTouches[0].clientX - touchStartX
          if (dx < -50) next()
          else if (dx > 50) prev()
          setTouchStartX(null)
        }}
      >
        <Image
          key={current}
          src={images[current]}
          alt={`Foto ${current + 1}`}
          fill
          unoptimized
          className="object-contain"
          sizes="92vw"
          priority
        />
      </div>

      {/* Next */}
      {images.length > 1 && (
        <button
          onClick={(e) => { e.stopPropagation(); next() }}
          className="absolute right-3 p-2 rounded-full hover:opacity-70 transition-opacity"
          style={{ background: 'rgba(255,255,255,0.1)', color: '#fff' }}
          aria-label="Próxima"
        >
          <ChevronRight className="w-6 h-6" />
        </button>
      )}

      {/* Dots */}
      {images.length > 1 && (
        <div className="absolute bottom-4 flex gap-2">
          {images.map((_, i) => (
            <button
              key={i}
              onClick={(e) => { e.stopPropagation(); setCurrent(i) }}
              style={{
                width: i === current ? 20 : 8,
                height: 8,
                borderRadius: 99,
                background: i === current ? '#fff' : 'rgba(255,255,255,0.4)',
                transition: 'all 0.2s',
                border: 'none',
                cursor: 'pointer',
              }}
              aria-label={`Foto ${i + 1}`}
            />
          ))}
        </div>
      )}
    </div>
  )

  return createPortal(content, document.body)
}

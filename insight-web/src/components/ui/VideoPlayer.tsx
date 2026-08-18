'use client'

import { useRef, useState } from 'react'
import { Play, Pause, Volume2, VolumeX } from 'lucide-react'

export function VideoPlayer({ src, className = '' }: { src: string; className?: string }) {
  const ref             = useRef<HTMLVideoElement>(null)
  const [playing, setPlaying]   = useState(false)
  const [muted, setMuted]       = useState(true)

  function toggle() {
    if (!ref.current) return
    if (playing) { ref.current.pause(); setPlaying(false) }
    else { ref.current.play().catch(() => {}); setPlaying(true) }
  }

  return (
    <div className={`relative group bg-black ${className}`} style={{ borderRadius: 'inherit' }}>
      <video
        ref={ref}
        src={src}
        loop
        muted={muted}
        playsInline
        preload="metadata"
        onEnded={() => setPlaying(false)}
        className="w-full h-full object-cover"
        style={{ borderRadius: 'inherit' }}
      />

      {/* Play/pause overlay */}
      <button
        onClick={toggle}
        className="absolute inset-0 flex items-center justify-center"
        aria-label={playing ? 'Pausar' : 'Reproduzir'}
      >
        {!playing && (
          <span
            className="w-14 h-14 rounded-full flex items-center justify-center"
            style={{ background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)' }}
          >
            <Play className="w-6 h-6 text-white ml-1" />
          </span>
        )}
      </button>

      {/* Controls bar */}
      <div
        className="absolute bottom-0 left-0 right-0 flex items-center gap-2 p-2 opacity-0 group-hover:opacity-100 transition-opacity"
        style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.6) 0%, transparent 100%)' }}
      >
        <button
          onClick={toggle}
          className="text-white"
          aria-label={playing ? 'Pausar' : 'Reproduzir'}
        >
          {playing ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
        </button>
        <button
          onClick={() => { setMuted((m) => !m); if (ref.current) ref.current.muted = !ref.current.muted }}
          className="text-white ml-auto"
          aria-label={muted ? 'Ativar som' : 'Silenciar'}
        >
          {muted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
        </button>
      </div>
    </div>
  )
}

export function isVideoUrl(url: string): boolean {
  return /\.(mp4|webm|mov)(\?|$)/i.test(url)
}

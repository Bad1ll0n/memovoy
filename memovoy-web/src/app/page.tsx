// src/app/page.tsx
// Landing page pública — redireciona para /feed se autenticado
'use client'

import Link             from 'next/link'
import { useEffect }    from 'react'
import { useRouter }    from 'next/navigation'
import { useAuthStore } from '@/store/auth'
import { NavBar }       from '@/components/layout/NavBar'

const HERO_DESTINATIONS = [
  { name: 'Kyoto',     img: 'https://images.unsplash.com/photo-1493976040374-85c8e12f0c0e?w=400&q=80', flag: '🇯🇵' },
  { name: 'Lisboa',    img: 'https://images.unsplash.com/photo-1555881400-74d7acaacd8b?w=400&q=80', flag: '🇵🇹' },
  { name: 'Patagónia', img: 'https://images.unsplash.com/photo-1501854140801-50d01698950b?w=400&q=80', flag: '🇦🇷' },
  { name: 'Marrocos',  img: 'https://images.unsplash.com/photo-1539020140153-e479b8c22e70?w=400&q=80', flag: '🇲🇦' },
  { name: 'Bali',      img: 'https://images.unsplash.com/photo-1537996194471-e657df975ab4?w=400&q=80', flag: '🇮🇩' },
  { name: 'Islanda',   img: 'https://images.unsplash.com/photo-1476610182048-b716b8518aae?w=400&q=80', flag: '🇮🇸' },
]

export default function LandingPage() {
  const { isAuthenticated, isHydrated } = useAuthStore()
  const router = useRouter()

  useEffect(() => {
    if (isHydrated && isAuthenticated) router.replace('/feed')
  }, [isHydrated, isAuthenticated, router])

  return (
    <div className="min-h-screen flex flex-col">
      <NavBar />

      {/* Hero */}
      <section className="relative flex-1 flex flex-col items-center justify-center text-center px-4 py-24 overflow-hidden">
        {/* Fundo com mosaico de imagens */}
        <div className="absolute inset-0 grid grid-cols-3 md:grid-cols-6 opacity-15 pointer-events-none select-none">
          {HERO_DESTINATIONS.map((d) => (
            <div key={d.name} className="relative overflow-hidden">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={d.img} alt={d.name} className="w-full h-full object-cover" />
            </div>
          ))}
        </div>
        {/* Gradiente sobre o mosaico */}
        <div className="absolute inset-0 bg-gradient-to-b from-surface-subtle/60 via-surface-subtle/80 to-surface-subtle" />

        {/* Conteúdo */}
        <div className="relative z-10 max-w-2xl mx-auto animate-fade-up">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-blue/8 text-blue text-sm font-medium mb-6">
            <span className="w-1.5 h-1.5 rounded-full bg-blue animate-pulse" />
            Disponível em Portugal e Brasil
          </div>

          <h1 className="font-display text-5xl md:text-6xl font-bold text-ink leading-[1.1] mb-6">
            As tuas viagens,{' '}
            <span className="text-blue italic">eternizadas</span>
          </h1>

          <p className="text-ink-secondary text-lg md:text-xl leading-relaxed mb-10 max-w-xl mx-auto">
            Cria roteiros com IA, partilha as tuas aventuras e descobre novos destinos
            através da comunidade de viajantes.
          </p>

          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link href="/auth/register" className="btn-primary text-base px-8 py-3.5">
              Começa grátis
            </Link>
            <Link href="/explore" className="btn-secondary text-base px-8 py-3.5">
              Ver roteiros
            </Link>
          </div>
        </div>

        {/* Cards flutuantes dos destinos */}
        <div className="relative z-10 mt-16 flex gap-3 overflow-x-auto scrollbar-hide pb-2 max-w-2xl mx-auto w-full">
          {HERO_DESTINATIONS.map((d) => (
            <div
              key={d.name}
              className="shrink-0 flex items-center gap-2 px-3 py-2 bg-surface rounded-full shadow-card text-sm font-medium text-ink animate-fade-in"
            >
              <span>{d.flag}</span>
              {d.name}
            </div>
          ))}
        </div>
      </section>

      {/* Features */}
      <section className="py-20 px-4 bg-surface">
        <div className="max-w-5xl mx-auto">
          <h2 className="font-display text-3xl md:text-4xl font-bold text-ink text-center mb-4">
            Planeamento sem esforço
          </h2>
          <p className="text-ink-secondary text-center mb-14 max-w-xl mx-auto">
            Da ideia ao roteiro completo em segundos — ou constrói ao teu ritmo.
          </p>

          <div className="grid md:grid-cols-3 gap-6">
            {[
              {
                icon:  '✨',
                title: 'Roteiros com IA',
                desc:  'Responde a 6 perguntas. A IA cria um programa completo com actividades, horários e avisos práticos.',
              },
              {
                icon:  '🗺',
                title: 'Partilha e descobre',
                desc:  'Publica as tuas viagens, inspira-te nas da comunidade e guarda os favoritos para quando precisares.',
              },
              {
                icon:  '🌱',
                title: 'Viaja de forma consciente',
                desc:  'Calcula a pegada de carbono do teu roteiro e compara com a média para o mesmo destino.',
              },
            ].map((f) => (
              <div key={f.title} className="card p-6 space-y-3">
                <span className="text-3xl">{f.icon}</span>
                <h3 className="font-display text-lg font-bold text-ink">{f.title}</h3>
                <p className="text-ink-secondary text-sm leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA final */}
      <section className="py-16 px-4 bg-blue text-center">
        <h2 className="font-display text-3xl md:text-4xl font-bold text-white mb-4">
          Pronto para a próxima aventura?
        </h2>
        <p className="text-blue-100 mb-8 max-w-md mx-auto">
          Junta-te a milhares de viajantes que já usam o MemoVoy.
        </p>
        <Link
          href="/auth/register"
          className="inline-flex items-center gap-2 px-8 py-3.5 rounded-lg bg-white text-blue font-semibold hover:bg-blue-50 transition-colors"
        >
          Criar conta gratuita
        </Link>
      </section>

      <footer className="py-8 px-4 border-t border-surface-muted bg-surface text-center">
        <p className="text-ink-tertiary text-sm">
          © {new Date().getFullYear()} MemoVoy · Feito com ❤️ para viajantes de PT e BR
        </p>
      </footer>
    </div>
  )
}

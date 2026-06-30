// src/app/layout.tsx
import type { Metadata, Viewport } from 'next'
import './globals.css'
import { Providers } from '@/components/layout/Providers'

// Fonts: Google Fonts indisponível neste ambiente — usar system fonts
const displayFont = { variable: '' }
const bodyFont    = { variable: '' }

export const metadata: Metadata = {
  title:       { default: 'MemoVoy', template: '%s · MemoVoy' },
  description: 'A tua rede social de viagens. Cria roteiros, partilha aventuras, inspira-te.',
  keywords:    ['viagens', 'roteiros', 'travel', 'itinerary', 'social'],
  openGraph: {
    type:      'website',
    siteName:  'MemoVoy',
    locale:    'pt_PT',
  },
  twitter: { card: 'summary_large_image' },
  robots: {
    index:  true,
    follow: true,
  },
}

export const viewport: Viewport = {
  width:          'device-width',
  initialScale:   1,
  themeColor:     '#185FA5',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html
      lang="pt"
      className={`${displayFont.variable} ${bodyFont.variable}`}
      suppressHydrationWarning
    >
      <body className="bg-surface-subtle font-body text-ink antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}

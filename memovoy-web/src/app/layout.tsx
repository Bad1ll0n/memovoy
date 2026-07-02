// src/app/layout.tsx
import type { Metadata, Viewport } from 'next'
import './globals.css'
import { Providers } from '@/components/layout/Providers'

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
    <html lang="pt" suppressHydrationWarning>
      <body className="bg-surface-subtle font-body text-ink antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}

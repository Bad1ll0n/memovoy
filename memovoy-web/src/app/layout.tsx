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
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,700;1,700&family=Inter:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
        <style>{`
          :root {
            --font-display: 'Playfair Display';
            --font-body: 'Inter';
          }
        `}</style>
      </head>
      <body className="bg-surface-subtle font-body text-ink antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}

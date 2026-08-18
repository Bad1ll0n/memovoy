import type { Metadata, Viewport } from 'next'
import { Poppins, Syne, DM_Sans } from 'next/font/google'
import './globals.css'
import { ServiceWorkerRegistrar } from '@/components/ui/ServiceWorkerRegistrar'
import { WebVitalsReporter } from '@/components/ui/WebVitalsReporter'

const poppins = Poppins({
  subsets: ['latin'],
  weight: ['300', '400', '500', '700', '900'],
  variable: '--font-poppins',
  display: 'swap',
})

const syne = Syne({
  subsets: ['latin'],
  weight: ['400', '600', '700', '800'],
  variable: '--font-syne',
  display: 'swap',
})

const dmSans = DM_Sans({
  subsets: ['latin'],
  weight: ['300', '400', '500'],
  variable: '--font-dm-sans',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'Memovoy',
  description: 'Descobre, partilha e planeia viagens com a tua comunidade.',
  icons: { icon: '/favicon.ico' },
  manifest: '/manifest.json',
  appleWebApp: { capable: true, statusBarStyle: 'black-translucent', title: 'Memovoy' },
}

// themeColor pertence ao export viewport, nao ao metadata. No metadata o Next 16
// ignora-o e avisa em cada pagina renderizada.
export const viewport: Viewport = {
  themeColor: '#C9F31D',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="pt"
      suppressHydrationWarning
      className={`${poppins.variable} ${syne.variable} ${dmSans.variable} h-full`}
    >
      <head>
        {/* Prevent theme flash */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('memovoy-theme');if(t==='light')document.documentElement.setAttribute('data-theme','light');}catch(e){}})();`,
          }}
        />
      </head>
      <body className="min-h-full antialiased">
        {/* Page loader — SVG idêntico ao Project_Roteiros original */}
        <div className="page-loader" id="__page-loader">
          <svg width="34" height="40" viewBox="0 0 24 30" xmlns="http://www.w3.org/2000/svg">
            <rect x="0" y="10" width="4" height="10" fill="#fca311" opacity="0.2">
              <animate attributeName="opacity" values="0.2;1;0.2" dur="0.8s" begin="0s" repeatCount="indefinite" />
              <animate attributeName="height" values="10;20;10" dur="0.8s" begin="0s" repeatCount="indefinite" />
              <animate attributeName="y" values="10;5;10" dur="0.8s" begin="0s" repeatCount="indefinite" />
            </rect>
            <rect x="8" y="10" width="4" height="10" fill="#fca311" opacity="0.2">
              <animate attributeName="opacity" values="0.2;1;0.2" dur="0.8s" begin="0.15s" repeatCount="indefinite" />
              <animate attributeName="height" values="10;20;10" dur="0.8s" begin="0.15s" repeatCount="indefinite" />
              <animate attributeName="y" values="10;5;10" dur="0.8s" begin="0.15s" repeatCount="indefinite" />
            </rect>
            <rect x="16" y="10" width="4" height="10" fill="#fca311" opacity="0.2">
              <animate attributeName="opacity" values="0.2;1;0.2" dur="0.8s" begin="0.3s" repeatCount="indefinite" />
              <animate attributeName="height" values="10;20;10" dur="0.8s" begin="0.3s" repeatCount="indefinite" />
              <animate attributeName="y" values="10;5;10" dur="0.8s" begin="0.3s" repeatCount="indefinite" />
            </rect>
          </svg>
        </div>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){function hide(){var el=document.getElementById('__page-loader');if(el){el.classList.add('done');setTimeout(function(){el.style.display='none';},320);}}if(document.readyState==='complete'){setTimeout(hide,100);}else{window.addEventListener('load',function(){setTimeout(hide,100);});setTimeout(hide,2000);}})();`,
          }}
        />
        <WebVitalsReporter />
        <ServiceWorkerRegistrar />
        {children}
      </body>
    </html>
  )
}

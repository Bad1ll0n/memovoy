import type { Metadata, Viewport } from 'next'
import { Plus_Jakarta_Sans, Fraunces } from 'next/font/google'
import './globals.css'
import { ServiceWorkerRegistrar } from '@/components/ui/ServiceWorkerRegistrar'
import { WebVitalsReporter } from '@/components/ui/WebVitalsReporter'

// Plus Jakarta Sans, humanista: as letras têm inclinação e cortes menos
// mecânicos do que a Poppins, que é geométrica. Lê-se com menos esforço em
// texto corrido — e o feed é texto corrido.
const jakarta = Plus_Jakarta_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800'],
  variable: '--font-app',
  display: 'swap',
})

// Fraunces nos títulos. É uma serifada com eixo óptico — redesenha-se conforme
// o tamanho —, e é isso que a faz aguentar um título de 14px sem se desfazer,
// que é onde a maioria das serifadas falha.
//
// Uma serifada ao lado de uma sans diz "isto é um título" sem precisar de peso
// nem de tamanho. Duas sans a competir uma com a outra não conseguem isso.
const fraunces = Fraunces({
  subsets: ['latin'],
  weight: ['600', '700'],
  variable: '--font-display',
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
      className={`${jakarta.variable} ${fraunces.variable} h-full`}
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
        {/*
          suppressHydrationWarning porque o script abaixo acrescenta a classe
          `done` a este elemento assim que a página acaba de carregar, o que
          costuma acontecer antes da hidratação. O React encontrava
          `page-loader done` no DOM contra `page-loader` no HTML servido e
          registava um erro de hidratação em todas as páginas. A divergência é
          intencional: o loader tem de desaparecer sem esperar pelo JavaScript
          da aplicação.
        */}
        <div className="page-loader" id="__page-loader" suppressHydrationWarning>
          <svg width="34" height="40" viewBox="0 0 24 30" xmlns="http://www.w3.org/2000/svg">
            <rect x="0" y="10" width="4" height="10" fill="var(--accent, #47A3CB)" opacity="0.2">
              <animate attributeName="opacity" values="0.2;1;0.2" dur="0.8s" begin="0s" repeatCount="indefinite" />
              <animate attributeName="height" values="10;20;10" dur="0.8s" begin="0s" repeatCount="indefinite" />
              <animate attributeName="y" values="10;5;10" dur="0.8s" begin="0s" repeatCount="indefinite" />
            </rect>
            <rect x="8" y="10" width="4" height="10" fill="var(--accent, #47A3CB)" opacity="0.2">
              <animate attributeName="opacity" values="0.2;1;0.2" dur="0.8s" begin="0.15s" repeatCount="indefinite" />
              <animate attributeName="height" values="10;20;10" dur="0.8s" begin="0.15s" repeatCount="indefinite" />
              <animate attributeName="y" values="10;5;10" dur="0.8s" begin="0.15s" repeatCount="indefinite" />
            </rect>
            <rect x="16" y="10" width="4" height="10" fill="var(--accent, #47A3CB)" opacity="0.2">
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

// next.config.ts
import type { NextConfig } from 'next'

const config: NextConfig = {
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'images.unsplash.com' },
      { protocol: 'https', hostname: '*.cloudfront.net'    },
      { protocol: 'https', hostname: '*.memovoy.com'       },
      // Dev: API local
      { protocol: 'http',  hostname: 'localhost'            },
    ],
  },
  async rewrites() {
    // Em dev, proxiar /api/* para a API Fastify em :3000
    return process.env.NODE_ENV === 'development'
      ? [{ source: '/api/:path*', destination: 'http://localhost:3000/:path*' }]
      : []
  },
  // Headers de segurança
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff'        },
          { key: 'X-Frame-Options',        value: 'DENY'           },
          { key: 'Referrer-Policy',        value: 'strict-origin'  },
        ],
      },
    ]
  },
}

export default config

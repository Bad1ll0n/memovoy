import type { Config } from 'tailwindcss'

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Cores primárias — idênticas às apps nativas
        blue: {
          DEFAULT: '#185FA5',
          50:  '#EEF4FB',
          100: '#D6E6F5',
          200: '#AACCEA',
          300: '#7DB3DF',
          400: '#4F99D4',
          500: '#2580C9',
          600: '#185FA5',
          700: '#134D87',
          800: '#0E3B69',
          900: '#09294B',
        },
        green: {
          DEFAULT: '#0F6E50',
          50:  '#ECF7F4',
          100: '#C9EDE4',
          200: '#93DBC9',
          300: '#5DC8AE',
          400: '#30B593',
          500: '#1A9A79',
          600: '#0F6E50',
          700: '#0C5841',
          800: '#094232',
          900: '#062C22',
        },
        amber: {
          DEFAULT: '#EF9F27',
          50:  '#FEF8EC',
          100: '#FCEECE',
          200: '#F9DD9D',
          300: '#F6CC6C',
          400: '#F3BB3B',
          500: '#EF9F27',
          600: '#D4850F',
          700: '#A8680C',
          800: '#7C4C09',
          900: '#503106',
        },
        // Cor do nível "nomad" — sem equivalente nas paletas base
        purple: {
          DEFAULT: '#7B1FA2',
          50:  '#F5E8FB',
          100: '#E8C9F5',
          200: '#D194EB',
          300: '#BA5FE1',
          400: '#A33DD6',
          500: '#8E22BE',
          600: '#7B1FA2',
          700: '#621882',
          800: '#491261',
          900: '#300C40',
        },
        // Token semântico de perigo (mapeado para red Tailwind)
        danger: {
          DEFAULT: '#DC2626',
          subtle:  '#FEF2F2',
          border:  '#FECACA',
        },
        // Neutros
        surface: {
          DEFAULT: '#FFFFFF',
          subtle: '#F7F7F5',
          muted:  '#EDEDEA',
        },
        ink: {
          DEFAULT: '#1A1A1A',
          secondary: '#5C5C5C',
          tertiary:  '#9C9C9C',
          disabled:  '#BDBDBD',
        },
      },
      fontFamily: {
        // Display: personalidade e hierarquia
        display: ['var(--font-display)', 'Georgia', 'serif'],
        // Body: leitura longa e UI
        body:    ['var(--font-body)',    'system-ui', 'sans-serif'],
        // Mono: dados, coords, timestamps
        mono:    ['var(--font-mono)',    'ui-monospace', 'monospace'],
      },
      fontSize: {
        '2xs': ['0.625rem', { lineHeight: '0.875rem' }],
        'xs':  ['0.75rem',  { lineHeight: '1rem'     }],
        'sm':  ['0.875rem', { lineHeight: '1.25rem'  }],
        'base':['1rem',     { lineHeight: '1.5rem'   }],
        'lg':  ['1.125rem', { lineHeight: '1.75rem'  }],
        'xl':  ['1.25rem',  { lineHeight: '1.75rem'  }],
        '2xl': ['1.5rem',   { lineHeight: '2rem'     }],
        '3xl': ['1.875rem', { lineHeight: '2.25rem'  }],
        '4xl': ['2.25rem',  { lineHeight: '2.5rem'   }],
        '5xl': ['3rem',     { lineHeight: '1.1'      }],
        '6xl': ['3.75rem',  { lineHeight: '1.05'     }],
      },
      borderRadius: {
        'sm':  '6px',
        'md':  '10px',
        'lg':  '14px',
        'xl':  '18px',
        '2xl': '24px',
        '3xl': '32px',
        'full':'9999px',
      },
      boxShadow: {
        'card':   '0 1px 4px 0 rgb(0 0 0 / 0.06), 0 4px 12px 0 rgb(0 0 0 / 0.04)',
        'card-md':'0 2px 8px 0 rgb(0 0 0 / 0.08), 0 8px 24px 0 rgb(0 0 0 / 0.06)',
        'card-lg':'0 4px 16px 0 rgb(0 0 0 / 0.10), 0 16px 40px 0 rgb(0 0 0 / 0.08)',
        'nav':    '0 -1px 0 0 rgb(0 0 0 / 0.06)',
      },
      keyframes: {
        'shimmer': {
          '0%':   { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0'  },
        },
        'fade-up': {
          '0%':   { opacity: '0', transform: 'translateY(12px)' },
          '100%': { opacity: '1', transform: 'translateY(0)'    },
        },
        'fade-in': {
          '0%':   { opacity: '0' },
          '100%': { opacity: '1' },
        },
        'like-pop': {
          '0%':   { transform: 'scale(1)'    },
          '50%':  { transform: 'scale(1.35)' },
          '100%': { transform: 'scale(1)'    },
        },
      },
      animation: {
        'shimmer':  'shimmer 1.8s linear infinite',
        'fade-up':  'fade-up 0.3s ease-out both',
        'fade-in':  'fade-in 0.2s ease-out both',
        'like-pop': 'like-pop 0.3s cubic-bezier(0.34,1.56,0.64,1)',
      },
    },
  },
  plugins: [],
}

export default config

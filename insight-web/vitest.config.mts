import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'

export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    // Ambiente Node: estes testes cobrem lógica pura e stores, não renderizam
    // componentes. Se vierem testes de componentes, passar para 'jsdom' e
    // acrescentar @testing-library/react.
    environment: 'node',
    include: ['src/**/*.test.ts'],
    restoreMocks: true,
  },
})

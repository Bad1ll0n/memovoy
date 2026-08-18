import { defineConfig, devices } from '@playwright/test'

// Smoke test: quatro percursos que, se estiverem quebrados, a app não serve
// para nada. Não é uma suite de cobertura — é a verificação mínima de que o
// registo, o login e o feed funcionam de ponta a ponta.
//
// Fica fora do CI de propósito. Levantar dois servidores e um browser torna o
// job lento, e uma suite end-to-end instável acaba por ser ignorada. Corre-se
// à mão antes de um deploy: `npm run e2e`.

const PORTA_WEB = 3000
const PORTA_API = 4000

// Aponta para a base de dados de teste, não para a de desenvolvimento — o
// registo cria utilizadores a sério. Localmente, define DATABASE_URL no
// ambiente com a password do teu Postgres.
const DATABASE_URL =
  process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@localhost:5432/memovoy_test'

export default defineConfig({
  testDir: './e2e',
  // Sequencial: os percursos partilham a base de dados.
  workers: 1,
  fullyParallel: false,
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [['list']],

  use: {
    baseURL: `http://localhost:${PORTA_WEB}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },

  projects: [
    // Regista uma conta uma vez; os testes autenticados reutilizam a sessão.
    // Sem isto a suite esgotava o limite de 5 registos por minuto da API.
    { name: 'setup', testMatch: /auth\.setup\.ts/ },

    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
      dependencies: ['setup'],
    },
  ],

  webServer: [
    {
      command: 'npm run dev',
      cwd: '../memovoy-api',
      url: `http://localhost:${PORTA_API}/health`,
      timeout: 90_000,
      reuseExistingServer: true,
      env: {
        // Sobrepõe-se ao --env-file=.env: o Node dá precedência ao ambiente.
        DATABASE_URL,
        NODE_ENV: 'test',
      },
    },
    {
      command: 'npm run dev',
      url: `http://localhost:${PORTA_WEB}`,
      timeout: 90_000,
      reuseExistingServer: true,
      env: {
        NEXT_PUBLIC_API_URL: `http://localhost:${PORTA_API}`,
      },
    },
  ],
})

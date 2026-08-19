import { test, expect, type Page } from '@playwright/test'

// Percursos mínimos. Se algum destes falhar, a app está inutilizável para um
// utilizador novo — que é precisamente o que um smoke test deve apanhar.

/** Credenciais únicas por execução, para não colidir com corridas anteriores. */
function novasCredenciais() {
  const sufixo = Date.now().toString(36) + Math.random().toString(36).slice(2, 6)
  return {
    username: `e2e${sufixo}`.toLowerCase().replace(/[^a-z0-9_]/g, ''),
    email:    `${sufixo}@exemplo-e2e.pt`,
    password: 'PasswordValida1',
  }
}

async function registar(page: Page, cred: ReturnType<typeof novasCredenciais>) {
  await page.goto('/auth/register')
  await page.getByLabel('Nome de utilizador').fill(cred.username)
  await page.getByLabel('Email').fill(cred.email)
  await page.getByLabel('Password', { exact: true }).fill(cred.password)
  await page.getByRole('button', { name: /criar conta|registar/i }).click()
}

test.describe('percursos críticos', () => {
  test('a página de login carrega e mostra o formulário', async ({ page }) => {
    await page.goto('/auth/login')

    await expect(page.getByRole('button', { name: /entrar/i })).toBeVisible()
    await expect(page).toHaveTitle(/memovoy/i)
  })

  test('registo cria conta e entra na aplicação', async ({ page }) => {
    const cred = novasCredenciais()

    await registar(page, cred)

    // Depois do registo vai para o onboarding ou para o feed, conforme o
    // estado de onboardingCompleted.
    await expect(page).toHaveURL(/\/(feed|onboarding)/, { timeout: 20_000 })
  })

  test('login com as credenciais criadas funciona', async ({ page }) => {
    const cred = novasCredenciais()
    await registar(page, cred)
    await expect(page).toHaveURL(/\/(feed|onboarding)/, { timeout: 20_000 })

    // Sai e volta a entrar pelo formulário de login.
    await page.context().clearCookies()
    await page.goto('/auth/login')

    await page.getByPlaceholder('tu@exemplo.com').fill(cred.email)
    await page.getByPlaceholder('••••••••').fill(cred.password)
    await page.getByRole('button', { name: /entrar/i }).click()

    await expect(page).toHaveURL(/\/(feed|onboarding)/, { timeout: 20_000 })
  })

  test('login com password errada recusa e não entra', async ({ page }) => {
    const cred = novasCredenciais()
    await registar(page, cred)
    await page.context().clearCookies()

    await page.goto('/auth/login')
    await page.getByPlaceholder('tu@exemplo.com').fill(cred.email)
    await page.getByPlaceholder('••••••••').fill('PasswordErrada9')
    await page.getByRole('button', { name: /entrar/i }).click()

    // Continua na página de login.
    await expect(page).toHaveURL(/\/auth\/login/)
  })

  test('o feed carrega sem erros de consola', async ({ page }) => {
    const erros: string[] = []
    page.on('console', (msg) => { if (msg.type() === 'error') erros.push(msg.text()) })

    const cred = novasCredenciais()
    await registar(page, cred)
    await page.goto('/feed')

    await expect(page.locator('body')).toBeVisible()

    // Ignora ruído de rede (imagens externas, favicons) — interessa código a rebentar.
    const relevantes = erros.filter((e) => !/favicon|net::ERR|Failed to load resource/i.test(e))
    expect(relevantes, `erros de consola no feed:\n${relevantes.join('\n')}`).toHaveLength(0)
  })
})

test.describe('rotas protegidas', () => {
  test('sem sessão, o feed manda para o login', async ({ page }) => {
    await page.context().clearCookies()
    await page.goto('/feed')

    await expect(page).toHaveURL(/\/auth\/login/, { timeout: 20_000 })
  })
})

test.describe('fronteiras de erro', () => {
  // Até aqui não existia um único error.tsx / not-found.tsx em toda a App
  // Router: um endereço inválido dava o ecrã por omissão do Next, que em
  // produção é um "Application error" cinzento sem saída.

  test('endereço inexistente mostra o 404 da app, não o do Next', async ({ page }) => {
    const res = await page.goto('/isto-nao-existe-de-certeza')

    expect(res?.status()).toBe(404)
    await expect(page.getByText('Esta página não existe')).toBeVisible()
    await expect(page.getByRole('link', { name: /Ir para o início/i })).toBeVisible()
  })

  test('do 404 dá para voltar ao início', async ({ page }) => {
    await page.goto('/caminho-invalido')
    await page.getByRole('link', { name: /Ir para o início/i }).click()

    // Sem sessão o feed reencaminha para o login; o que importa é ter saído do 404.
    await page.waitForURL((url) => !url.pathname.includes('caminho-invalido'))
    await expect(page.getByText('Esta página não existe')).toHaveCount(0)
  })
})

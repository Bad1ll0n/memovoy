import { test, expect } from '@playwright/test'

// Verificação isolada: o refresh token é rotativo e o antigo fica revogado.
// Isso é correcto do ponto de vista de segurança, mas levanta a questão de o
// que acontece quando o mesmo utilizador tem a app aberta em duas tabs — ambas
// partilham o cookie e ambas tentam renovar.
//
// Sessão criada de raiz aqui, sem storageState partilhado, para o resultado não
// vir contaminado por um cookie já consumido por outro teste.

test.use({ storageState: { cookies: [], origins: [] } })

test('duas tabs do mesmo utilizador — nenhuma é expulsa', async ({ context }) => {
  const sufixo = Date.now().toString(36) + Math.random().toString(36).slice(2, 6)
  const cred = {
    username: `mt${sufixo}`.toLowerCase().replace(/[^a-z0-9_]/g, ''),
    email:    `${sufixo}@qa-mt.pt`,
    password: 'PasswordValida1',
  }

  const tab1 = await context.newPage()
  await tab1.goto('/auth/register')
  await tab1.getByLabel('Nome de utilizador').fill(cred.username)
  await tab1.getByLabel('Email').fill(cred.email)
  await tab1.getByLabel('Password', { exact: true }).fill(cred.password)
  await tab1.getByRole('button', { name: /criar conta|registar/i }).click()
  await expect(tab1).toHaveURL(/\/(feed|onboarding)/, { timeout: 20_000 })

  // Segunda tab, mesmo contexto: partilha os cookies, como um separador novo.
  const tab2 = await context.newPage()
  await tab2.goto('/feed')
  await tab2.waitForLoadState('networkidle')

  await expect(tab2, 'a segunda tab não devia mandar o utilizador para o login')
    .not.toHaveURL(/\/auth\/login/)

  // E a primeira continua viva depois de a segunda ter renovado?
  await tab1.reload()
  await tab1.waitForLoadState('networkidle')

  await expect(tab1, 'a primeira tab não devia perder a sessão por causa da segunda')
    .not.toHaveURL(/\/auth\/login/)

  await tab1.close()
  await tab2.close()
})

test('refresh repetido na mesma tab mantém a sessão', async ({ page }) => {
  const sufixo = Date.now().toString(36) + Math.random().toString(36).slice(2, 6)
  await page.goto('/auth/register')
  await page.getByLabel('Nome de utilizador').fill(`rp${sufixo}`.toLowerCase().replace(/[^a-z0-9_]/g, ''))
  await page.getByLabel('Email').fill(`${sufixo}@qa-rp.pt`)
  await page.getByLabel('Password', { exact: true }).fill('PasswordValida1')
  await page.getByRole('button', { name: /criar conta|registar/i }).click()
  await expect(page).toHaveURL(/\/(feed|onboarding)/, { timeout: 20_000 })

  // Três recargas seguidas: cada uma renova o token.
  for (let i = 1; i <= 3; i++) {
    await page.reload()
    await page.waitForLoadState('networkidle')
    await expect(page, `expulso ao fim de ${i} recarga(s)`).not.toHaveURL(/\/auth\/login/)
  }
})

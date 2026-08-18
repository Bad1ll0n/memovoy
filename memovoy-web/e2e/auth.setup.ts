import { test as setup, expect } from '@playwright/test'
import { FICHEIRO_SESSAO } from './sessao'

// Regista uma conta uma vez e guarda a sessão em disco, para os testes a
// reutilizarem.
//
// Sem isto cada teste registava a sua conta e a suite esgotava o limite de 5
// registos por minuto do /auth/register — o que produzia falhas que pareciam
// bugs da aplicação e não eram. O limite existe e está correcto; o problema era
// o desenho dos testes.

setup('autenticar uma vez', async ({ page }) => {
  const sufixo = Date.now().toString(36) + Math.random().toString(36).slice(2, 6)
  const cred = {
    username: `qa${sufixo}`.toLowerCase().replace(/[^a-z0-9_]/g, ''),
    email:    `${sufixo}@qa-exp.pt`,
    password: 'PasswordValida1',
  }

  await page.goto('/auth/register')
  await page.getByLabel('Nome de utilizador').fill(cred.username)
  await page.getByLabel('Email').fill(cred.email)
  await page.getByLabel('Password', { exact: true }).fill(cred.password)
  await page.getByRole('button', { name: /criar conta|registar/i }).click()

  await expect(page).toHaveURL(/\/(feed|onboarding)/, { timeout: 20_000 })

  await page.context().storageState({ path: FICHEIRO_SESSAO })
})

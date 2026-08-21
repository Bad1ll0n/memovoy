import { test, expect, type Page, type BrowserContext } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

// Varrimento de acessibilidade com axe-core.
//
// O skip link foi feito à mão e testado à mão. O resto da app nunca foi
// verificado: 104 atributos aria em 37 componentes é pouco, e "pouco" não é
// diagnóstico — isto mede.
//
// Só se verificam violações sérias e críticas. As menores incluem coisas como
// contraste em texto decorativo, que dariam ruído suficiente para o teste
// passar a ser ignorado.

const ANONIMO = { cookies: [], origins: [] }
const NIVEIS = ['serious', 'critical']

/** Corre o axe e devolve as violações que interessam, já resumidas. */
async function violacoes(page: Page) {
  const r = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze()

  return r.violations
    .filter((v) => NIVEIS.includes(v.impact ?? ''))
    .map((v) => ({
      id: v.id,
      impacto: v.impact,
      nos: v.nodes.length,
      exemplo: v.nodes[0]?.html?.slice(0, 120),
      descricao: v.help,
    }))
}

/** Falha com um relatório legível em vez de um objecto gigante. */
function semViolacoes(lista: Awaited<ReturnType<typeof violacoes>>, pagina: string) {
  const relatorio = lista
    .map((v) => `  [${v.impacto}] ${v.id} (${v.nos}×) — ${v.descricao}\n    ${v.exemplo}`)
    .join('\n')

  expect(lista, `${pagina}:\n${relatorio}`).toEqual([])
}

test.describe('páginas públicas', () => {
  test.use({ storageState: ANONIMO })

  for (const [nome, url] of [
    ['login', '/auth/login'],
    ['registo', '/auth/register'],
    ['recuperar password', '/auth/forgot-password'],
    ['privacidade', '/privacy'],
    ['termos', '/terms'],
  ] as const) {
    test(nome, async ({ page }) => {
      await page.goto(url)
      await page.waitForLoadState('networkidle')

      semViolacoes(await violacoes(page), nome)
    })
  }
})

test.describe('páginas da aplicação', () => {
  // Em série e com sessão própria: a partilhada morre com a rotação do refresh
  // token, e registar por teste esgotava o limite de 5 por minuto da API.
  test.describe.configure({ mode: 'serial' })
  test.use({ storageState: ANONIMO })

  let contexto: BrowserContext
  let page: Page

  test.beforeAll(async ({ browser }) => {
    // Contexto explícito: o axe não consegue injectar-se numa página criada
    // com browser.newPage(), que usa o contexto por omissão.
    contexto = await browser.newContext()
    page = await contexto.newPage()
    const sufixo = Date.now().toString(36) + Math.random().toString(36).slice(2, 6)

    await page.goto('/auth/register')
    await page.getByLabel('Nome de utilizador').fill(`a11y${sufixo}`.toLowerCase().replace(/[^a-z0-9_]/g, ''))
    await page.getByLabel('Email').fill(`${sufixo}@a11y.pt`)
    await page.getByLabel('Password', { exact: true }).fill('PasswordValida1')
    await page.getByRole('button', { name: /criar conta|registar/i }).click()
    await expect(page).toHaveURL(/\/(feed|onboarding)/, { timeout: 20_000 })
  })

  test.afterAll(async () => { await contexto.close() })

  for (const [nome, url] of [
    ['feed', '/feed'],
    ['explorar', '/explore'],
    ['roteiros', '/itineraries'],
    ['mensagens', '/messages'],
    ['notificações', '/notifications'],
    ['pesquisa', '/search'],
    ['definições', '/settings'],
  ] as const) {
    test(nome, async () => {
      await page.goto(url)
      await page.waitForLoadState('networkidle')

      semViolacoes(await violacoes(page), nome)
    })
  }
})

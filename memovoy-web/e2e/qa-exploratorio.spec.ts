import { test, expect, type Page } from '@playwright/test'
import { FICHEIRO_SESSAO } from './sessao'

// Passagem exploratória de QA sobre a interface. Não é a suite de smoke — aqui
// o objectivo é partir: URLs directos, back/forward, refresh a meio, ecrãs
// pequenos, estados vazios e sessão perdida.
//
// A sessão vem do projecto `setup`, registada uma só vez. Registar por teste
// esgotava o limite de 5 por minuto da API e produzia falhas que pareciam bugs.

const ANONIMO = { cookies: [], origins: [] }

/** Texto visível da página, para distinguir "vazio" de "com conteúdo". */
async function textoDaPagina(page: Page) {
  await page.waitForLoadState('networkidle')
  return (await page.locator('body').innerText()).trim()
}

test.describe('acesso directo a URLs internos sem sessão', () => {
  test.use({ storageState: ANONIMO })

  // Estas exigem sessão e devem mandar para o login.
  for (const url of ['/feed', '/itineraries', '/messages', '/notifications', '/settings', '/groups']) {
    test(`${url} redirecciona para o login`, async ({ page }) => {
      await page.goto(url)
      await expect(page).toHaveURL(/\/auth\/login/, { timeout: 20_000 })
    })
  }

  // /map e /search passaram a exigir sessão como os irmãos do grupo (app).
  // As APIs por trás continuam públicas — a mudança é de coerência da interface.
  for (const url of ['/map', '/search']) {
    test(`${url} passou a exigir sessão`, async ({ page }) => {
      await page.goto(url)
      await expect(page).toHaveURL(/\/auth\/login/, { timeout: 20_000 })
    })
  }
})

test.describe('URLs com identificadores inexistentes', () => {
  test.use({ storageState: FICHEIRO_SESSAO })

  const casos = [
    ['perfil inexistente',   '/profile/00000000-0000-0000-0000-000000000000'],
    ['roteiro inexistente',  '/itineraries/00000000-0000-0000-0000-000000000000'],
    ['id malformado',        '/posts/isto-nao-e-um-id'],
  ]

  for (const [nome, url] of casos) {
    test(`${nome} não fica em branco`, async ({ page }) => {
      await page.goto(url)
      const texto = await textoDaPagina(page)
      expect(texto.length, 'deve mostrar algo legível, não um ecrã vazio').toBeGreaterThan(20)
    })
  }
})

test.describe('estados vazios', () => {
  test.use({ storageState: FICHEIRO_SESSAO })

  for (const [nome, url] of [['feed', '/feed'], ['mensagens', '/messages'], ['notificações', '/notifications']]) {
    test(`${nome} sem conteúdo diz alguma coisa`, async ({ page }) => {
      await page.goto(url)
      const texto = await textoDaPagina(page)
      expect(texto.length, 'um estado vazio não pode ser um ecrã em branco').toBeGreaterThan(20)
    })
  }
})

test.describe('navegação do browser', () => {
  // Sessão própria e modo série: o refresh token é rotativo, por isso um cookie
  // guardado só serve para uma renovação. Partilhar o storageState entre estes
  // testes produzia falhas que pareciam perda de sessão e eram do teste.
  test.describe.configure({ mode: 'serial' })
  test.use({ storageState: ANONIMO })

  let page: Page

  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage()
    const sufixo = Date.now().toString(36) + Math.random().toString(36).slice(2, 6)
    await page.goto('/auth/register')
    await page.getByLabel('Nome de utilizador').fill(`nav${sufixo}`.toLowerCase().replace(/[^a-z0-9_]/g, ''))
    await page.getByLabel('Email').fill(`${sufixo}@qa-nav.pt`)
    await page.getByLabel('Password', { exact: true }).fill('PasswordValida1')
    await page.getByRole('button', { name: /criar conta|registar/i }).click()
    await expect(page).toHaveURL(/\/(feed|onboarding)/, { timeout: 20_000 })
  })

  test.afterAll(async () => { await page.close() })

  test('back e forward mantêm a sessão', async () => {
    await page.goto('/itineraries')
    await page.goto('/settings')

    await page.goBack()
    await page.waitForLoadState('networkidle')
    await expect(page, 'voltar atrás não pode expulsar para o login').not.toHaveURL(/\/auth\/login/)

    await page.goForward()
    await page.waitForLoadState('networkidle')
    await expect(page).not.toHaveURL(/\/auth\/login/)
  })

  test('refresh numa página protegida mantém a sessão', async () => {
    await page.goto('/settings')
    await page.reload()
    await page.waitForLoadState('networkidle')
    await expect(page, 'a sessão deve sobreviver a um refresh').not.toHaveURL(/\/auth\/login/)
  })
})

test.describe('sessão perdida a meio', () => {
  test.use({ storageState: FICHEIRO_SESSAO })

  test('cookies limpos levam ao login, não a um ecrã partido', async ({ page }) => {
    await page.goto('/feed')

    await page.context().clearCookies()
    await page.evaluate(() => { try { localStorage.clear() } catch {} })

    await page.goto('/settings')
    await expect(page).toHaveURL(/\/auth\/login/, { timeout: 20_000 })
  })
})

test.describe('responsividade', () => {
  test.use({ storageState: FICHEIRO_SESSAO })

  const ecras = [
    { nome: 'telemóvel', width: 375, height: 812 },
    { nome: 'tablet',    width: 768, height: 1024 },
    { nome: 'desktop',   width: 1440, height: 900 },
  ]
  const paginas = ['/feed', '/settings', '/itineraries']

  for (const ecra of ecras) {
    for (const url of paginas) {
      test(`${ecra.nome} — ${url} não faz scroll horizontal`, async ({ page }) => {
        await page.setViewportSize({ width: ecra.width, height: ecra.height })
        await page.goto(url)
        await page.waitForLoadState('networkidle')

        const overflow = await page.evaluate(() =>
          document.documentElement.scrollWidth - document.documentElement.clientWidth)

        expect(overflow, `${overflow}px a transbordar na horizontal`).toBeLessThanOrEqual(1)
      })
    }
  }
})

test.describe('formulários — feedback ao utilizador', () => {
  test.use({ storageState: ANONIMO })

  test('submeter o login vazio não deixa a página muda', async ({ page }) => {
    await page.goto('/auth/login')
    await page.getByRole('button', { name: /entrar/i }).click()
    await page.waitForTimeout(1200)

    await expect(page, 'não pode navegar com campos vazios').toHaveURL(/\/auth\/login/)
  })

  test('password errada mostra mensagem e não navega', async ({ page }) => {
    await page.goto('/auth/login')
    await page.getByPlaceholder('tu@exemplo.com').fill('ninguem@qa-exp.pt')
    await page.getByPlaceholder('••••••••').fill('PasswordErrada9')
    await page.getByRole('button', { name: /entrar/i }).click()

    await page.waitForTimeout(2000)
    await expect(page).toHaveURL(/\/auth\/login/)

    const texto = await textoDaPagina(page)
    expect(texto.length, 'o utilizador precisa de perceber o que falhou').toBeGreaterThan(20)
  })
})

test.describe('acessibilidade — verificações básicas', () => {
  test.use({ storageState: ANONIMO })

  test('a página de login tem um h1', async ({ page }) => {
    await page.goto('/auth/login')
    expect(await page.locator('h1').count(),
      'sem h1 a estrutura não é navegável por leitor de ecrã').toBeGreaterThan(0)
  })

  test('os campos de login têm rótulo associado', async ({ page }) => {
    await page.goto('/auth/login')

    const semRotulo = await page.evaluate(() => {
      const inputs = [...document.querySelectorAll('input')]
        .filter((i) => !['hidden', 'submit', 'button'].includes(i.type))
      return inputs.filter((i) => {
        if (i.getAttribute('aria-label') || i.getAttribute('aria-labelledby')) return false
        if (i.id && document.querySelector(`label[for="${i.id}"]`)) return false
        if (i.closest('label')) return false
        return true
      }).map((i) => i.getAttribute('name') ?? i.type)
    })

    expect(semRotulo, `campos sem rótulo: ${semRotulo.join(', ')}`).toHaveLength(0)
  })
})

test.describe('acessibilidade — área autenticada', () => {
  test.use({ storageState: FICHEIRO_SESSAO })

  test('as imagens do feed têm texto alternativo', async ({ page }) => {
    await page.goto('/feed')
    await page.waitForLoadState('networkidle')

    const semAlt = await page.evaluate(() =>
      [...document.querySelectorAll('img')].filter((i) => !i.hasAttribute('alt')).length)

    expect(semAlt, `${semAlt} imagens sem atributo alt`).toBe(0)
  })

  test('cada página tem um título distinto no separador', async ({ page }) => {
    const titulos = new Map<string, string>()
    for (const url of ['/feed', '/settings', '/itineraries']) {
      await page.goto(url)
      await page.waitForLoadState('networkidle')
      titulos.set(url, await page.title())
    }

    for (const [url, titulo] of titulos) {
      expect(titulo.trim().length, `${url} sem título`).toBeGreaterThan(0)
    }
  })
})

test.describe('acessibilidade por teclado', () => {
  // Sessão própria, não a partilhada. A do projecto `setup` é rodada a cada
  // pedido de refresh pelos testes que correm antes deste, e chegava aqui já
  // morta — o teste aterrava no login e falhava por um motivo que nada tem a
  // ver com o que se quer verificar.
  test.use({ storageState: ANONIMO })

  test('o skip link está escondido, o primeiro Tab revela-o e ele leva ao conteúdo', async ({ page }) => {
    const sufixo = Date.now().toString(36) + Math.random().toString(36).slice(2, 6)
    await page.goto('/auth/register')
    await page.getByLabel('Nome de utilizador').fill(`a11y${sufixo}`.toLowerCase().replace(/[^a-z0-9_]/g, ''))
    await page.getByLabel('Email').fill(`${sufixo}@a11y.pt`)
    await page.getByLabel('Password', { exact: true }).fill('PasswordValida1')
    await page.getByRole('button', { name: /criar conta|registar/i }).click()
    await expect(page).toHaveURL(/\/(feed|onboarding)/, { timeout: 20_000 })

    await page.goto('/feed')
    await page.waitForLoadState('networkidle')
    expect(page.url(), 'o teste tem de estar dentro da app, não no login').toContain('/feed')

    // Fora do ecrã, não removido: display:none tirava-o da ordem de tabulação.
    const link = page.getByRole('link', { name: /Saltar para o conteúdo/i })
    await expect(link).toHaveCount(1)
    await expect(link).not.toBeInViewport()

    // Primeiro focável do documento, à frente do banner de verificação de email.
    await page.keyboard.press('Tab')
    const focado = page.locator(':focus')
    await expect(focado).toHaveText(/Saltar para o conteúdo/i)
    await expect(focado).toBeInViewport()

    await page.keyboard.press('Enter')
    const idFocado = await page.evaluate(() => document.activeElement?.id ?? '')
    expect(idFocado).toBe('conteudo-principal')
  })
})

import { test, describe, before, after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { query } from '../../src/db/pool.js'
import { criarApp, fecharApp, limparBaseDeDados, registarUtilizador, comToken, criarPost } from './helpers.js'

// O interruptor "conta privada" não filtrava nada.
//
// Era gravado, era devolvido pela API, aparecia ligado nas definições — e as
// publicações continuavam a sair no /explore, no /search, no /posts/:id e no
// perfil, sem sequer ser preciso um token. A verificação existia num único
// sítio (as marcações em /users/:id/saved) e nunca foi aplicada aos restantes.
//
// Estes testes cobrem os dois lados, e o segundo importa tanto como o primeiro:
// é fácil "corrigir" isto com um filtro demasiado largo que esconde também as
// contas públicas, e aí ninguém dá por nada até o feed começar a esvaziar.

let app
let privada      // conta com is_private = true
let publica      // conta normal, para provar que continua visível
let estranho     // terceiro que não segue ninguém
let postPrivado
let postPublico

const SEGREDO = 'conteudo-de-conta-privada-nao-deve-sair'
const ABERTO  = 'conteudo-de-conta-publica-deve-continuar-a-sair'

before(async () => { app = await criarApp() })
after(async () => { await fecharApp(app) })

beforeEach(async () => {
  await limparBaseDeDados()

  privada  = await registarUtilizador(app)
  publica  = await registarUtilizador(app)
  estranho = await registarUtilizador(app)

  postPrivado = await criarPost(app, privada.accessToken, {
    caption: SEGREDO,
    images: ['https://exemplo.pt/a.jpg'],
    destination: 'Sítio Escondido',
    lat: 38.72, lon: -9.14,
  })
  postPublico = await criarPost(app, publica.accessToken, {
    caption: ABERTO,
    images: ['https://exemplo.pt/b.jpg'],
    destination: 'Sítio Aberto',
    lat: 38.72, lon: -9.14,
  })

  // Marcado como privado DEPOIS de publicar, de propósito: a decisão é que o
  // interruptor vale para trás. Se só valesse para publicações futuras, ligá-lo
  // não faria praticamente nada, que era o defeito original.
  await app.inject({
    method: 'PATCH', url: '/users/me',
    headers: comToken(privada.accessToken),
    payload: { isPrivate: true },
  })
})

/** Os sítios onde um post pode aparecer. Sem token — o pior caso. */
function caminhosDeLeitura(idPrivado, idAutorPrivado) {
  return [
    ['/explore',                            null],
    [`/posts/${idPrivado}`,                 null],
    [`/posts/${idPrivado}/comments`,        null],
    [`/users/${idAutorPrivado}/posts`,      null],
    ['/search?q=conteudo',                  null],
    ['/posts/nearby?lat=38.72&lon=-9.14&radius=50', null],
  ]
}

/** Rotas que respondem 403 em bloco em vez de filtrarem linha a linha. Estas
 *  não devolvem publicações, devolvem histórico: onde a pessoa fez check-in,
 *  que países visitou, quantas viagens fez por ano. */
function caminhosDeHistorico(idAutorPrivado) {
  return [
    `/users/${idAutorPrivado}/posts`,
    `/users/${idAutorPrivado}/saved`,
    `/users/${idAutorPrivado}/checkins`,
    `/users/${idAutorPrivado}/travel-stats`,
    `/map/users/${idAutorPrivado}`,
  ]
}

describe('publicações de uma conta privada', () => {
  test('não saem em nenhum caminho de leitura para quem não está autenticado', async () => {
    const falhas = []

    for (const [url] of caminhosDeLeitura(postPrivado.id, privada.user.id)) {
      const res = await app.inject({ method: 'GET', url })
      if (res.body.includes(SEGREDO)) falhas.push(`${url} → ${res.statusCode}`)
    }

    assert.deepEqual(falhas, [], 'estes endpoints deixaram escapar conteúdo de uma conta privada')
  })

  test('nem para um utilizador autenticado que não a segue', async () => {
    const falhas = []

    for (const [url] of caminhosDeLeitura(postPrivado.id, privada.user.id)) {
      const res = await app.inject({ method: 'GET', url, headers: comToken(estranho.accessToken) })
      if (res.body.includes(SEGREDO)) falhas.push(`${url} → ${res.statusCode}`)
    }

    assert.deepEqual(falhas, [])
  })

  test('o perfil responde 403 e não uma lista vazia', async () => {
    // A diferença importa para a interface: uma lista vazia é indistinguível
    // de alguém que ainda não publicou nada, e o perfil precisa de mostrar o
    // cadeado em vez de "sem publicações".
    const res = await app.inject({ method: 'GET', url: `/users/${privada.user.id}/posts` })
    assert.equal(res.statusCode, 403)
    assert.match(JSON.parse(res.body).message, /privada/i)
  })

  test('o histórico de viagens também está fechado', async () => {
    // Check-ins e estatísticas não são publicações, mas dizem onde a pessoa
    // esteve e quando. Estavam abertos a qualquer um, sem token.
    const abertos = []
    for (const url of caminhosDeHistorico(privada.user.id)) {
      const res = await app.inject({ method: 'GET', url })
      if (res.statusCode !== 403) abertos.push(`${url} → ${res.statusCode}`)
    }
    assert.deepEqual(abertos, [], 'estes caminhos deviam responder 403 a quem não tem direito')
  })

  test('a publicação isolada responde 404, não 403', async () => {
    // 403 confirmaria que aquele id existe. Para um recurso individual isso já
    // é informação a mais.
    const res = await app.inject({ method: 'GET', url: `/posts/${postPrivado.id}` })
    assert.equal(res.statusCode, 404)
  })

  test('os comentários seguem a publicação a que pertencem', async () => {
    // Esconder o post e deixar a conversa aberta revelaria o mesmo por outra
    // porta: quem comentou, quando, e sobre o quê.
    await app.inject({
      method: 'POST', url: `/posts/${postPrivado.id}/comments`,
      headers: comToken(privada.accessToken),
      payload: { content: 'comentario-que-nao-deve-sair' },
    })

    const res = await app.inject({ method: 'GET', url: `/posts/${postPrivado.id}/comments` })
    assert.equal(JSON.parse(res.body).comments.length, 0)
  })
})

describe('quem tem direito a ver', () => {
  test('o próprio autor continua a ver as suas publicações', async () => {
    const perfil = await app.inject({
      method: 'GET', url: `/users/${privada.user.id}/posts`,
      headers: comToken(privada.accessToken),
    })
    assert.equal(perfil.statusCode, 200)
    assert.ok(perfil.body.includes(SEGREDO), 'o autor deixou de ver o que é dele')

    const isolado = await app.inject({
      method: 'GET', url: `/posts/${postPrivado.id}`,
      headers: comToken(privada.accessToken),
    })
    assert.equal(isolado.statusCode, 200)
  })

  test('quem já a segue continua a ver', async () => {
    await app.inject({
      method: 'POST', url: `/users/${privada.user.id}/follow`,
      headers: comToken(estranho.accessToken),
    })

    const perfil = await app.inject({
      method: 'GET', url: `/users/${privada.user.id}/posts`,
      headers: comToken(estranho.accessToken),
    })
    assert.equal(perfil.statusCode, 200)
    assert.ok(perfil.body.includes(SEGREDO))

    const fechados = []
    for (const url of caminhosDeHistorico(privada.user.id)) {
      const res = await app.inject({ method: 'GET', url, headers: comToken(estranho.accessToken) })
      if (res.statusCode === 403) fechados.push(url)
    }
    assert.deepEqual(fechados, [], 'quem segue devia passar em todos')
  })
})

describe('as contas públicas não podem ser apanhadas no meio', () => {
  // O erro fácil ao corrigir isto é filtrar de mais. Um feed que esvazia por
  // causa de uma regra de privacidade demasiado larga é uma avaria silenciosa:
  // ninguém reporta "vejo menos publicações do que devia".
  test('continuam visíveis em todos os caminhos, sem autenticação', async () => {
    const urls = [
      '/explore',
      `/posts/${postPublico.id}`,
      `/users/${publica.user.id}/posts`,
      '/search?q=conteudo',
      '/posts/nearby?lat=38.72&lon=-9.14&radius=50',
    ]

    const ausentes = []
    for (const url of urls) {
      const res = await app.inject({ method: 'GET', url })
      if (!res.body.includes(ABERTO)) ausentes.push(`${url} → ${res.statusCode}`)
    }

    assert.deepEqual(ausentes, [], 'a regra de privacidade está a esconder contas públicas')
  })

  test('o feed curado de quem não segue ninguém mostra as públicas e esconde as privadas', async () => {
    // Este é o caminho que o /feed usa quando ainda não segues ninguém. Ficou
    // de fora da correcção original por não ser óbvio que devolve conteúdo de
    // terceiros.
    const res = await app.inject({
      method: 'GET', url: '/feed', headers: comToken(estranho.accessToken),
    })

    assert.equal(res.statusCode, 200)
    assert.ok(res.body.includes(ABERTO),  'o feed curado devia trazer as públicas')
    assert.ok(!res.body.includes(SEGREDO), 'o feed curado trouxe uma conta privada')
  })
})

describe('a regra em si', () => {
  test('voltar a pôr a conta pública torna as publicações visíveis outra vez', async () => {
    await app.inject({
      method: 'PATCH', url: '/users/me',
      headers: comToken(privada.accessToken),
      payload: { isPrivate: false },
    })

    const res = await app.inject({ method: 'GET', url: '/explore' })
    assert.ok(res.body.includes(SEGREDO), 'o interruptor tem de funcionar nos dois sentidos')
  })

  test('a coluna is_private é mesmo o que manda, não o número de seguidores', async () => {
    // Guarda contra uma correcção que por acaso funcione nos testes por a conta
    // privada não ter seguidores nenhuns.
    await query('UPDATE users SET is_private = FALSE WHERE id = $1', [privada.user.id])
    const antes = await app.inject({ method: 'GET', url: '/explore' })
    assert.ok(antes.body.includes(SEGREDO))

    await query('UPDATE users SET is_private = TRUE WHERE id = $1', [privada.user.id])
    const depois = await app.inject({ method: 'GET', url: '/explore' })
    assert.ok(!depois.body.includes(SEGREDO))
  })
})

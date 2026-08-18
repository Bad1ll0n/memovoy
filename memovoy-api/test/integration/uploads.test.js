import { test, describe, before, after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { criarApp, fecharApp, limparBaseDeDados, registarUtilizador, comToken } from './helpers.js'

// Upload de ficheiros contra MinIO a sério (docker compose up -d em memovoy-api).
//
// A validação de magic bytes já tinha testes unitários; o que faltava era o
// caminho completo — multipart, S3, e o URL devolvido. Salta se o MinIO não
// estiver de pé, para não falhar em quem não o tenha ligado.

const ENDPOINT = process.env.S3_ENDPOINT ?? 'http://localhost:9000'

let app
let ana

// Verificado no carregamento do módulo, não num before(): a opção `skip` de
// cada test() é avaliada quando o test é declarado, e isso acontece antes de
// qualquer hook correr. Com a verificação no before, os testes saltavam sempre.
const temCredenciais = Boolean(process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY)

const respondeMinio = await (async () => {
  try {
    const r = await fetch(`${ENDPOINT}/minio/health/live`, { signal: AbortSignal.timeout(2000) })
    return r.ok
  } catch {
    return false
  }
})()

// As duas condições contam. Com o MinIO de pé mas sem credenciais no ambiente,
// o pedido ia na mesma e voltava 500 do lado do S3 — uma falha que parece um bug
// da aplicação e não é.
const temMinio = respondeMinio && temCredenciais

if (!temMinio) {
  const razao = !respondeMinio
    ? 'MinIO indisponível — correr: docker compose up -d'
    : 'sem AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY no ambiente'
  console.log(`[uploads] testes saltados: ${razao}`)
}

/** PNG de 1×1 válido, com os magic bytes correctos. */
const PNG_VALIDO = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
)

/** Executável Windows disfarçado: extensão e mimetype de imagem, bytes de MZ. */
const FALSO_PNG = Buffer.concat([Buffer.from([0x4D, 0x5A, 0x90, 0x00]), Buffer.alloc(60)])

/** Constrói um corpo multipart à mão — o inject não tem helper para isto. */
function multipart(nomeFicheiro, tipo, conteudo) {
  const fronteira = '----memovoyQA' + Math.random().toString(36).slice(2)
  const cabeca = Buffer.from(
    `--${fronteira}\r\n` +
    `Content-Disposition: form-data; name="file"; filename="${nomeFicheiro}"\r\n` +
    `Content-Type: ${tipo}\r\n\r\n`,
  )
  const cauda = Buffer.from(`\r\n--${fronteira}--\r\n`)
  return {
    payload: Buffer.concat([cabeca, conteudo, cauda]),
    headers: { 'content-type': `multipart/form-data; boundary=${fronteira}` },
  }
}

before(async () => { app = await criarApp() })

after(async () => { await fecharApp(app) })

beforeEach(async () => {
  await limparBaseDeDados()
  ana = await registarUtilizador(app)
})

describe('POST /uploads/image', () => {
  test('exige autenticação', async () => {
    const { payload, headers } = multipart('a.png', 'image/png', PNG_VALIDO)
    const res = await app.inject({ method: 'POST', url: '/uploads/image', payload, headers })
    assert.equal(res.statusCode, 401)
  })

  test('um PNG válido é aceite e devolve um URL', { skip: !temMinio && 'MinIO indisponível' }, async () => {
    const { payload, headers } = multipart('foto.png', 'image/png', PNG_VALIDO)
    const res = await app.inject({
      method: 'POST', url: '/uploads/image',
      headers: { ...headers, ...comToken(ana.accessToken) },
      payload,
    })

    assert.ok(res.statusCode < 300, `esperado 2xx, veio ${res.statusCode}: ${res.body}`)
    const body = JSON.parse(res.body)
    assert.ok(body.publicUrl, `devia devolver um publicUrl: ${res.body}`)
    assert.match(body.publicUrl, /^https?:\/\//)
    assert.ok(body.key, 'devia devolver a chave do objecto')
  })

  test('o ficheiro fica mesmo acessível no URL devolvido', { skip: !temMinio && 'MinIO indisponível' }, async () => {
    const { payload, headers } = multipart('foto.png', 'image/png', PNG_VALIDO)
    const res = await app.inject({
      method: 'POST', url: '/uploads/image',
      headers: { ...headers, ...comToken(ana.accessToken) },
      payload,
    })
    const { publicUrl } = JSON.parse(res.body)

    const descarregado = await fetch(publicUrl)
    assert.equal(descarregado.status, 200, `o URL devolvido tem de servir o ficheiro: ${publicUrl}`)

    const bytes = Buffer.from(await descarregado.arrayBuffer())
    assert.deepEqual(bytes, PNG_VALIDO, 'o conteúdo tem de chegar intacto')
  })

  test('cada upload recebe uma chave distinta', { skip: !temMinio && 'MinIO indisponível' }, async () => {
    const urls = []
    for (let i = 0; i < 2; i++) {
      const { payload, headers } = multipart('mesma.png', 'image/png', PNG_VALIDO)
      const res = await app.inject({
        method: 'POST', url: '/uploads/image',
        headers: { ...headers, ...comToken(ana.accessToken) },
        payload,
      })
      urls.push(JSON.parse(res.body).publicUrl)
    }

    assert.notEqual(urls[0], urls[1], 'dois uploads não podem sobrepor-se')
  })
})

describe('POST /uploads/image — ficheiros recusados', () => {
  test('executável com extensão e mimetype de imagem é recusado', async () => {
    const { payload, headers } = multipart('malicioso.png', 'image/png', FALSO_PNG)
    const res = await app.inject({
      method: 'POST', url: '/uploads/image',
      headers: { ...headers, ...comToken(ana.accessToken) },
      payload,
    })

    assert.equal(res.statusCode, 400, 'os magic bytes não correspondem ao tipo declarado')
    assert.match(JSON.parse(res.body).message, /conteúdo|tipo/i)
  })

  test('extensão que não corresponde ao mimetype é recusada', async () => {
    const { payload, headers } = multipart('foto.jpg', 'image/png', PNG_VALIDO)
    const res = await app.inject({
      method: 'POST', url: '/uploads/image',
      headers: { ...headers, ...comToken(ana.accessToken) },
      payload,
    })

    assert.equal(res.statusCode, 400)
  })

  test('tipo não permitido é recusado', async () => {
    const { payload, headers } = multipart('doc.pdf', 'application/pdf', Buffer.from('%PDF-1.4\n'))
    const res = await app.inject({
      method: 'POST', url: '/uploads/image',
      headers: { ...headers, ...comToken(ana.accessToken) },
      payload,
    })

    assert.equal(res.statusCode, 400)
  })

  test('pedido sem ficheiro é recusado', async () => {
    const res = await app.inject({
      method: 'POST', url: '/uploads/image',
      headers: { 'content-type': 'multipart/form-data; boundary=----vazio', ...comToken(ana.accessToken) },
      payload: Buffer.from('------vazio--\r\n'),
    })

    assert.equal(res.statusCode, 400)
  })
})

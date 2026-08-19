import { test, describe, before, after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { query } from '../../src/db/pool.js'
import { criarApp, fecharApp, limparBaseDeDados, registarUtilizador, comToken } from './helpers.js'

// Fila de moderação.
//
// O POST /reports existia há muito e escrevia em content_reports, mas nada lia
// essa tabela: nenhum endpoint, nenhuma página, e o `is_admin` só era
// consultado num sítio em todo o código. Quem denunciasse conteúdo abusivo via
// a denúncia ficar na base de dados para sempre.

let app
let ana, bob, admin

before(async () => { app = await criarApp() })
after(async () => { await fecharApp(app) })

beforeEach(async () => {
  await limparBaseDeDados()
  ana   = await registarUtilizador(app)
  bob   = await registarUtilizador(app)
  admin = await registarUtilizador(app)
  await query('UPDATE users SET is_admin = TRUE WHERE id = $1', [admin.user.id])
})

/** Publica com a Ana e devolve o id. */
async function publicarComAAna(caption = 'conteúdo denunciável') {
  const { rows } = await query(
    `INSERT INTO posts (user_id, caption, images)
     VALUES ($1, $2, '["/x.jpg"]'::jsonb) RETURNING id`,
    [ana.user.id, caption],
  )
  return rows[0].id
}

/** Denuncia um alvo em nome de quem for pedido. */
function denunciar(quem, targetType, targetId, reason = 'spam') {
  return app.inject({
    method: 'POST', url: '/reports',
    headers: comToken(quem.accessToken),
    payload: { targetType, targetId, reason },
  })
}

describe('acesso à área de moderação', () => {
  test('sem sessão não se chega lá', async () => {
    const res = await app.inject({ method: 'GET', url: '/admin/reports' })
    assert.equal(res.statusCode, 401)
  })

  test('um utilizador normal recebe 404, não 403', async () => {
    // Deliberado: um 403 confirma que a rota existe e diz a quem anda a sondar
    // que há uma área de administração que vale a pena atacar.
    const res = await app.inject({
      method: 'GET', url: '/admin/reports', headers: comToken(bob.accessToken),
    })

    assert.equal(res.statusCode, 404)
  })

  test('o mesmo 404 aparece na resolução', async () => {
    const res = await app.inject({
      method: 'POST', url: '/admin/reports/resolve',
      headers: comToken(bob.accessToken),
      payload: { targetType: 'post', targetId: '00000000-0000-0000-0000-000000000000', resolution: 'dismissed' },
    })

    assert.equal(res.statusCode, 404)
  })

  test('perder o estatuto de admin fecha a porta de imediato', async () => {
    // A flag é lida da base de dados a cada pedido, nunca do token: um token
    // sobrevive à remoção do estatuto, e confiar numa claim lá dentro deixava
    // uma conta despromovida com poderes de moderação até expirar.
    const antes = await app.inject({
      method: 'GET', url: '/admin/reports', headers: comToken(admin.accessToken),
    })
    assert.equal(antes.statusCode, 200)

    await query('UPDATE users SET is_admin = FALSE WHERE id = $1', [admin.user.id])

    const depois = await app.inject({
      method: 'GET', url: '/admin/reports', headers: comToken(admin.accessToken),
    })
    assert.equal(depois.statusCode, 404, 'o mesmo token não pode continuar a servir')
  })

  test('um administrador vê a fila', async () => {
    const res = await app.inject({
      method: 'GET', url: '/admin/reports', headers: comToken(admin.accessToken),
    })

    assert.equal(res.statusCode, 200)
    assert.ok(Array.isArray(JSON.parse(res.body).reports))
  })
})

describe('a fila de moderação', () => {
  test('mostra a denúncia com o excerto do conteúdo', async () => {
    const postId = await publicarComAAna('isto é spam a sério')
    await denunciar(bob, 'post', postId)

    const res = await app.inject({
      method: 'GET', url: '/admin/reports', headers: comToken(admin.accessToken),
    })

    const { reports } = JSON.parse(res.body)
    assert.equal(reports.length, 1)
    assert.equal(reports[0].targetId, postId)
    assert.equal(reports[0].total, 1)
    assert.match(reports[0].excerto, /spam a sério/)
    assert.equal(reports[0].existe, true)
  })

  test('agrupa por alvo e conta quem denunciou', async () => {
    // Dez pessoas a denunciar a mesma publicação são um caso a decidir, não dez.
    const postId = await publicarComAAna()
    await denunciar(bob, 'post', postId, 'spam')
    await denunciar(admin, 'post', postId, 'hate')

    const res = await app.inject({
      method: 'GET', url: '/admin/reports', headers: comToken(admin.accessToken),
    })

    const { reports } = JSON.parse(res.body)
    assert.equal(reports.length, 1, 'as duas denúncias são o mesmo caso')
    assert.equal(reports[0].total, 2)
    assert.deepEqual([...reports[0].motivos].sort(), ['hate', 'spam'])
    assert.equal(reports[0].denunciantes.length, 2)
  })

  test('conteúdo já desaparecido aparece marcado, não em falta', async () => {
    const postId = await publicarComAAna()
    await denunciar(bob, 'post', postId)
    await query('DELETE FROM posts WHERE id = $1', [postId])

    const res = await app.inject({
      method: 'GET', url: '/admin/reports', headers: comToken(admin.accessToken),
    })

    const { reports } = JSON.parse(res.body)
    assert.equal(reports.length, 1, 'a denúncia continua na fila')
    assert.equal(reports[0].existe, false)
    assert.equal(reports[0].excerto, null)
  })

  test('as estatísticas contam pendentes e resolvidas', async () => {
    const postId = await publicarComAAna()
    await denunciar(bob, 'post', postId)

    const antes = JSON.parse((await app.inject({
      method: 'GET', url: '/admin/reports/stats', headers: comToken(admin.accessToken),
    })).body)
    assert.equal(antes.pendentes, 1)
    assert.equal(antes.resolvidas, 0)

    await app.inject({
      method: 'POST', url: '/admin/reports/resolve',
      headers: comToken(admin.accessToken),
      payload: { targetType: 'post', targetId: postId, resolution: 'dismissed' },
    })

    const depois = JSON.parse((await app.inject({
      method: 'GET', url: '/admin/reports/stats', headers: comToken(admin.accessToken),
    })).body)
    assert.equal(depois.pendentes, 0)
    assert.equal(depois.resolvidas, 1)
  })
})

describe('resolver denúncias', () => {
  test('arquivar tira da fila e não toca no conteúdo', async () => {
    const postId = await publicarComAAna()
    await denunciar(bob, 'post', postId)

    const res = await app.inject({
      method: 'POST', url: '/admin/reports/resolve',
      headers: comToken(admin.accessToken),
      payload: { targetType: 'post', targetId: postId, resolution: 'dismissed', note: 'não procede' },
    })

    assert.equal(res.statusCode, 200)

    const { rows } = await query('SELECT 1 FROM posts WHERE id = $1', [postId])
    assert.equal(rows.length, 1, 'arquivar não apaga a publicação')

    const fila = JSON.parse((await app.inject({
      method: 'GET', url: '/admin/reports', headers: comToken(admin.accessToken),
    })).body)
    assert.equal(fila.reports.length, 0)
  })

  test('remover apaga a publicação', async () => {
    const postId = await publicarComAAna()
    await denunciar(bob, 'post', postId)

    await app.inject({
      method: 'POST', url: '/admin/reports/resolve',
      headers: comToken(admin.accessToken),
      payload: { targetType: 'post', targetId: postId, resolution: 'removed' },
    })

    const { rows } = await query('SELECT 1 FROM posts WHERE id = $1', [postId])
    assert.equal(rows.length, 0)
  })

  test('um roteiro é despublicado, não destruído', async () => {
    // É trabalho de alguém: sair da vista pública resolve o problema sem apagar
    // a viagem do autor.
    const { rows: iti } = await query(
      `INSERT INTO itineraries (user_id, title, destination, data, is_public)
       VALUES ($1, 'Viagem', 'Lisboa', '{"days":[]}'::jsonb, TRUE) RETURNING id`,
      [ana.user.id],
    )
    await denunciar(bob, 'itinerary', iti[0].id)

    await app.inject({
      method: 'POST', url: '/admin/reports/resolve',
      headers: comToken(admin.accessToken),
      payload: { targetType: 'itinerary', targetId: iti[0].id, resolution: 'removed' },
    })

    const { rows } = await query('SELECT is_public FROM itineraries WHERE id = $1', [iti[0].id])
    assert.equal(rows.length, 1, 'o roteiro continua a existir')
    assert.equal(rows[0].is_public, false, 'mas deixa de estar público')
  })

  test('contas não se apagam a partir daqui', async () => {
    await denunciar(bob, 'user', ana.user.id)

    const res = await app.inject({
      method: 'POST', url: '/admin/reports/resolve',
      headers: comToken(admin.accessToken),
      payload: { targetType: 'user', targetId: ana.user.id, resolution: 'removed' },
    })

    assert.equal(res.statusCode, 400)

    const { rows } = await query('SELECT 1 FROM users WHERE id = $1', [ana.user.id])
    assert.equal(rows.length, 1, 'a conta tem de continuar de pé')
  })

  test('todas as denúncias sobre o mesmo alvo se resolvem juntas', async () => {
    const postId = await publicarComAAna()
    await denunciar(bob, 'post', postId)
    await denunciar(admin, 'post', postId)

    const res = await app.inject({
      method: 'POST', url: '/admin/reports/resolve',
      headers: comToken(admin.accessToken),
      payload: { targetType: 'post', targetId: postId, resolution: 'dismissed' },
    })

    assert.equal(JSON.parse(res.body).resolvidas, 2)

    const { rows } = await query(
      `SELECT COUNT(*)::int AS n FROM content_reports WHERE status = 'pending'`,
    )
    assert.equal(rows[0].n, 0)
  })

  test('resolver duas vezes não passa à segunda', async () => {
    const postId = await publicarComAAna()
    await denunciar(bob, 'post', postId)

    await app.inject({
      method: 'POST', url: '/admin/reports/resolve',
      headers: comToken(admin.accessToken),
      payload: { targetType: 'post', targetId: postId, resolution: 'dismissed' },
    })

    const segunda = await app.inject({
      method: 'POST', url: '/admin/reports/resolve',
      headers: comToken(admin.accessToken),
      payload: { targetType: 'post', targetId: postId, resolution: 'removed' },
    })

    assert.equal(segunda.statusCode, 404, 'já não há nada pendente sobre isto')

    const { rows } = await query('SELECT 1 FROM posts WHERE id = $1', [postId])
    assert.equal(rows.length, 1, 'e o conteúdo não foi apagado pela segunda tentativa')
  })

  test('quem resolveu fica registado na auditoria', async () => {
    const postId = await publicarComAAna()
    await denunciar(bob, 'post', postId)

    await app.inject({
      method: 'POST', url: '/admin/reports/resolve',
      headers: comToken(admin.accessToken),
      payload: { targetType: 'post', targetId: postId, resolution: 'removed' },
    })

    const { rows } = await query(
      `SELECT user_id, details FROM audit_logs WHERE action = 'moderation_resolve'`,
    )
    assert.equal(rows.length, 1)
    assert.equal(rows[0].user_id, admin.user.id)
    assert.equal(rows[0].details.resolution, 'removed')
  })
})

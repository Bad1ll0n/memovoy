import { test, describe, before, after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import jwt from 'jsonwebtoken'
import { Server as SocketIO } from 'socket.io'
import { io as clienteIo } from 'socket.io-client'
import { query, pool } from '../../src/db/pool.js'
import { buildApp } from '../../src/app.js'
import { setupSocket } from '../../src/services/socket.js'
import { limparBaseDeDados, registarUtilizador, comToken } from './helpers.js'

// Tempo real com servidor e cliente a sério. Ao contrário do resto da suite,
// isto precisa de um socket à escuta — o app.inject() não serve.
//
// Era a última área do relatório de QA por cobrir.

let app, servidorIo, porta
let ana, bob

// Todos os clientes abertos, para os fechar mesmo quando um teste falha a meio.
// Sem isto um socket órfão mantinha o processo vivo e a suite não terminava.
const abertos = new Set()

before(async () => {
  const construido = await buildApp({ rateLimit: false })
  app = construido.app
  await app.listen({ port: 0, host: '127.0.0.1' })
  porta = app.server.address().port

  servidorIo = new SocketIO(app.server, { cors: { origin: '*' } })
  global._io = servidorIo
  setupSocket(servidorIo, process.env.JWT_SECRET)
})

after(async () => {
  for (const s of abertos) s.close()
  abertos.clear()
  await servidorIo.close()
  await app.close()
  await pool.end()
  global._io = null
})

beforeEach(async () => {
  for (const s of abertos) s.close()
  abertos.clear()
  await limparBaseDeDados()
  ana = await registarUtilizador(app)
  bob = await registarUtilizador(app)
})

/**
 * Liga um cliente e resolve com { ligado, erro }. Não rejeita — o que interessa
 * é distinguir ligação aceite de recusada, não fazer o teste rebentar.
 */
function ligar(token, timeoutMs = 4000) {
  return new Promise((resolve) => {
    const s = clienteIo(`http://127.0.0.1:${porta}`, {
      auth: token === undefined ? {} : { token },
      transports: ['websocket'],
      reconnection: false,
      timeout: timeoutMs,
    })
    abertos.add(s)

    const terminar = (resultado) => {
      clearTimeout(guarda)
      resolve({ ...resultado, socket: s })
    }
    const guarda = setTimeout(() => terminar({ ligado: false, erro: 'timeout' }), timeoutMs)

    s.on('connect', () => terminar({ ligado: true, erro: null }))
    s.on('connect_error', (e) => terminar({ ligado: false, erro: e.message }))
  })
}

/**
 * Espera que o socket esteja mesmo dentro da sala, perguntando ao adapter do
 * servidor. Os handlers de join fazem um import() dinâmico e uma query antes de
 * chamar socket.join(), por isso um sleep fixo é uma corrida: emitir para a
 * sala antes de a entrada estar feita perde o evento e o teste falha às vezes.
 */
async function esperarSala(sala, socketId, ms = 4000) {
  const limite = Date.now() + ms
  while (Date.now() < limite) {
    if (servidorIo.sockets.adapter.rooms.get(sala)?.has(socketId)) return true
    await new Promise((r) => setTimeout(r, 25))
  }
  return false
}

/** Espera por um evento, ou resolve null ao fim do tempo dado. */
function esperarEvento(socket, nome, ms = 1500) {
  return new Promise((resolve) => {
    const guarda = setTimeout(() => resolve(null), ms)
    socket.once(nome, (dados) => { clearTimeout(guarda); resolve(dados ?? {}) })
  })
}

describe('autenticação do socket', () => {
  test('token de acesso válido liga', async () => {
    const { ligado, erro, socket } = await ligar(ana.accessToken)
    socket.close()

    assert.equal(ligado, true, `devia ligar, veio: ${erro}`)
  })

  test('sem token é recusado', async () => {
    const { ligado, socket } = await ligar(undefined)
    socket.close()

    assert.equal(ligado, false)
  })

  test('token inventado é recusado', async () => {
    const { ligado, socket } = await ligar('isto.nao.e-um-token')
    socket.close()

    assert.equal(ligado, false)
  })

  test('token assinado com outro segredo é recusado', async () => {
    const forjado = jwt.sign({ id: ana.user.id }, 'segredo-do-atacante-com-32-caracteres', {
      algorithm: 'HS256', expiresIn: '15m',
    })

    const { ligado, socket } = await ligar(forjado)
    socket.close()

    assert.equal(ligado, false, 'a assinatura tem de ser verificada')
  })

  test('token expirado é recusado', async () => {
    const expirado = jwt.sign({ id: ana.user.id }, process.env.JWT_SECRET, {
      algorithm: 'HS256', expiresIn: '-1s',
    })

    const { ligado, socket } = await ligar(expirado)
    socket.close()

    assert.equal(ligado, false)
  })

  test('token de 2FA pendente não liga — não é uma sessão', async () => {
    // Mesmo vector que o bypass fechado no decorator authenticate: o tempToken
    // é assinado com o mesmo segredo, por isso a verificação de assinatura
    // aceita-o. Se o socket não olhar para o scope, quem só tiver a password
    // recebe as notificações em tempo real da vítima.
    const tempToken = jwt.sign({ id: ana.user.id, scope: '2fa-pending' }, process.env.JWT_SECRET, {
      algorithm: 'HS256', expiresIn: '5m',
    })

    const { ligado, socket } = await ligar(tempToken)
    socket.close()

    assert.equal(ligado, false, 'um token de 2FA pendente não pode abrir um socket')
  })
})

describe('isolamento entre utilizadores', () => {
  test('cada um recebe apenas os seus eventos', async () => {
    const daAna = await ligar(ana.accessToken)
    const doBob = await ligar(bob.accessToken)
    assert.ok(daAna.ligado && doBob.ligado, 'ambos deviam ligar')

    const esperaAna = esperarEvento(daAna.socket, 'new_notification')
    const esperaBob = esperarEvento(doBob.socket, 'new_notification')

    servidorIo.to(`user:${ana.user.id}`).emit('new_notification', { type: 'teste' })

    const recebidoAna = await esperaAna
    const recebidoBob = await esperaBob

    daAna.socket.close(); doBob.socket.close()

    assert.ok(recebidoAna, 'a Ana devia receber o seu evento')
    assert.equal(recebidoBob, null, 'o Bob não pode receber eventos da Ana')
  })

  test('seguir alguém entrega-lhe notificação em tempo real', async () => {
    const daAna = await ligar(ana.accessToken)
    assert.ok(daAna.ligado)

    const espera = esperarEvento(daAna.socket, 'new_notification', 3000)

    await app.inject({
      method: 'POST', url: `/users/${ana.user.id}/follow`,
      headers: comToken(bob.accessToken),
    })

    const recebido = await espera
    daAna.socket.close()

    assert.ok(recebido, 'quem é seguido devia ser notificado em tempo real')
  })
})

describe('salas de conversa', () => {
  /** Abre conversa entre ana e bob e devolve o id. */
  async function abrirConversa() {
    const r = await app.inject({
      method: 'POST', url: '/conversations',
      headers: comToken(ana.accessToken),
      payload: { userId: bob.user.id },
    })
    return JSON.parse(r.body).id
  }

  test('um participante entra na sala e recebe o que lá é emitido', async () => {
    const convId = await abrirConversa()
    const daAna = await ligar(ana.accessToken)

    daAna.socket.emit('join_conversation', convId)
    assert.ok(await esperarSala(`conv:${convId}`, daAna.socket.id), 'devia ter entrado na sala')

    const espera = esperarEvento(daAna.socket, 'new_message')
    servidorIo.to(`conv:${convId}`).emit('new_message', { content: 'olá' })
    const recebido = await espera

    daAna.socket.close()
    assert.ok(recebido, 'o participante devia receber a mensagem')
  })

  test('quem não participa não entra na sala', async () => {
    const convId = await abrirConversa()

    // Um terceiro, fora da conversa.
    const intruso = await registarUtilizador(app)
    const doIntruso = await ligar(intruso.accessToken)

    doIntruso.socket.emit('join_conversation', convId)
    await new Promise((r) => setTimeout(r, 1000)) // provar ausência: dar tempo ao join para (não) acontecer

    const espera = esperarEvento(doIntruso.socket, 'new_message')
    servidorIo.to(`conv:${convId}`).emit('new_message', { content: 'segredo' })
    const recebido = await espera

    doIntruso.socket.close()
    assert.equal(recebido, null, 'um estranho não pode ouvir a conversa')
  })

  test('enviar mensagem avisa o destinatário para refrescar a lista', async () => {
    // É este o evento que mantém o badge de não lidas certo. Havia também um
    // `unread_messages` com uma contagem, que ninguém ouvia e cujo valor era
    // só daquela conversa apesar do nome; foi removido.
    const convId = await abrirConversa()
    const doBob = await ligar(bob.accessToken)

    const espera = esperarEvento(doBob.socket, 'conversations:updated', 3000)

    const res = await app.inject({
      method: 'POST', url: '/messages',
      headers: comToken(ana.accessToken),
      payload: { conversationId: convId, content: 'olá Bob' },
    })
    assert.equal(res.statusCode, 201, `a mensagem devia ser criada: ${res.body}`)

    const recebido = await espera
    doBob.socket.close()

    assert.ok(recebido, 'o destinatário devia ser avisado')
  })

  test('sala de conversa inexistente não é aceite', async () => {
    const daAna = await ligar(ana.accessToken)

    daAna.socket.emit('join_conversation', '00000000-0000-0000-0000-000000000000')
    await new Promise((r) => setTimeout(r, 1000)) // provar ausência: dar tempo ao join para (não) acontecer

    const espera = esperarEvento(daAna.socket, 'new_message')
    servidorIo.to('conv:00000000-0000-0000-0000-000000000000').emit('new_message', { content: 'x' })
    const recebido = await espera

    daAna.socket.close()
    assert.equal(recebido, null)
  })
})

describe('salas de roteiro', () => {
  test('o dono entra na sala do seu roteiro', async () => {
    const iti = JSON.parse((await app.inject({
      method: 'POST', url: '/itineraries', headers: comToken(ana.accessToken),
      payload: { title: 'T', destination: 'D', data: { days: [] } },
    })).body)

    const daAna = await ligar(ana.accessToken)
    daAna.socket.emit('join_itinerary', iti.id)
    assert.ok(await esperarSala(`itinerary:${iti.id}`, daAna.socket.id), 'o dono devia entrar na sala')

    const espera = esperarEvento(daAna.socket, 'itinerary_changed')
    servidorIo.to(`itinerary:${iti.id}`).emit('itinerary_changed', { dayIndex: 0 })
    const recebido = await espera

    daAna.socket.close()
    assert.ok(recebido)
  })

  test('quem não é dono nem colaborador não entra', async () => {
    const iti = JSON.parse((await app.inject({
      method: 'POST', url: '/itineraries', headers: comToken(ana.accessToken),
      payload: { title: 'T', destination: 'D', data: { days: [] } },
    })).body)

    const doBob = await ligar(bob.accessToken)
    doBob.socket.emit('join_itinerary', iti.id)
    await new Promise((r) => setTimeout(r, 1000)) // provar ausência: dar tempo ao join para (não) acontecer

    const espera = esperarEvento(doBob.socket, 'itinerary_changed')
    servidorIo.to(`itinerary:${iti.id}`).emit('itinerary_changed', { dayIndex: 0 })
    const recebido = await espera

    doBob.socket.close()
    assert.equal(recebido, null, 'o roteiro é da Ana')
  })
})

describe('difusão de alterações do roteiro', () => {
  /** Cria um roteiro da Ana com um dia e uma actividade, e convida o Bob. */
  async function roteiroPartilhado() {
    const iti = JSON.parse((await app.inject({
      method: 'POST', url: '/itineraries', headers: comToken(ana.accessToken),
      payload: {
        title: 'Lisboa', destination: 'Lisboa',
        data: { days: [{ activities: [{
          time: '10:00', name: 'Torre', description: 'd', type: 'visit', currency: 'EUR',
        }] }] },
      },
    })).body)

    await app.inject({
      method: 'POST', url: `/itineraries/${iti.id}/collaborators`,
      headers: comToken(ana.accessToken),
      payload: { userId: bob.user.id, role: 'editor' },
    })

    return iti.id
  }

  const ACTIVIDADE = {
    time: '11:00', name: 'Mosteiro', description: 'novo', type: 'visit', currency: 'EUR',
  }

  test('um colaborador recebe a alteração feita pelo dono', async () => {
    const itiId = await roteiroPartilhado()

    const doBob = await ligar(bob.accessToken)
    doBob.socket.emit('join_itinerary', itiId)
    assert.ok(await esperarSala(`itinerary:${itiId}`, doBob.socket.id), 'o colaborador devia entrar na sala')

    const espera = esperarEvento(doBob.socket, 'itinerary_changed', 3000)

    const res = await app.inject({
      method: 'PATCH', url: `/itineraries/${itiId}/activity`,
      headers: comToken(ana.accessToken),
      payload: { dayIndex: 0, activityIndex: 0, activity: ACTIVIDADE },
    })
    assert.equal(res.statusCode, 200, `o PATCH devia passar: ${res.body}`)

    const recebido = await espera
    doBob.socket.close()

    assert.ok(recebido, 'o colaborador devia ver a alteração em tempo real')
    assert.equal(recebido.activity.name, 'Mosteiro')
  })

  test('quem edita não recebe o eco da sua própria alteração', async () => {
    // O x-socket-id identifica a origem. Sem a exclusão, quem edita apanhava o
    // seu próprio evento, refazia o pedido à toa e arriscava estalar por cima
    // de uma alteração local ainda por confirmar.
    const itiId = await roteiroPartilhado()

    const daAna = await ligar(ana.accessToken)
    daAna.socket.emit('join_itinerary', itiId)
    assert.ok(await esperarSala(`itinerary:${itiId}`, daAna.socket.id))

    const espera = esperarEvento(daAna.socket, 'itinerary_changed', 2000)

    await app.inject({
      method: 'PATCH', url: `/itineraries/${itiId}/activity`,
      headers: { ...comToken(ana.accessToken), 'x-socket-id': daAna.socket.id },
      payload: { dayIndex: 0, activityIndex: 0, activity: ACTIVIDADE },
    })

    const recebido = await espera
    daAna.socket.close()

    assert.equal(recebido, null, 'a origem da alteração não pode receber o seu próprio evento')
  })

  test('sem x-socket-id a difusão chega a toda a gente', async () => {
    // Degradação deliberada: chamadas de servidor e sockets ainda por ligar não
    // têm id, e nesse caso vale mais difundir a mais do que a menos.
    const itiId = await roteiroPartilhado()

    const daAna = await ligar(ana.accessToken)
    daAna.socket.emit('join_itinerary', itiId)
    assert.ok(await esperarSala(`itinerary:${itiId}`, daAna.socket.id))

    const espera = esperarEvento(daAna.socket, 'itinerary_changed', 3000)

    await app.inject({
      method: 'PATCH', url: `/itineraries/${itiId}/activity`,
      headers: comToken(ana.accessToken),
      payload: { dayIndex: 0, activityIndex: 0, activity: ACTIVIDADE },
    })

    const recebido = await espera
    daAna.socket.close()

    assert.ok(recebido, 'sem id de origem, a sala inteira recebe')
  })
})

describe('sala de administração', () => {
  test('um utilizador normal não entra em admin:alerts', async () => {
    const daAna = await ligar(ana.accessToken)
    await new Promise((r) => setTimeout(r, 1000)) // provar ausência: dar tempo ao join para (não) acontecer

    const espera = esperarEvento(daAna.socket, 'moderation_alert')
    servidorIo.to('admin:alerts').emit('moderation_alert', { severity: 'alta' })
    const recebido = await espera

    daAna.socket.close()
    assert.equal(recebido, null, 'alertas de moderação são só para administradores')
  })

  test('um administrador entra em admin:alerts', async () => {
    await query('UPDATE users SET is_admin = TRUE WHERE id = $1', [ana.user.id])

    const daAna = await ligar(ana.accessToken)
    assert.ok(await esperarSala('admin:alerts', daAna.socket.id), 'o administrador devia entrar na sala')

    const espera = esperarEvento(daAna.socket, 'moderation_alert')
    servidorIo.to('admin:alerts').emit('moderation_alert', { severity: 'alta' })
    const recebido = await espera

    daAna.socket.close()
    assert.ok(recebido, 'o administrador devia receber o alerta')
  })
})

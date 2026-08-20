import { test, describe, before, after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { criarApp, fecharApp, limparBaseDeDados, registarUtilizador, comToken } from './helpers.js'

// Onde estive e onde vou estar são a mesma informação em momentos diferentes.
//
// Que alguém esteve nos Açores no ano passado é uma história de viagem, e é o
// que dá vida ao explorar e aos rankings. Que alguém vai estar nos Açores para
// a semana é outra coisa: diz que a casa fica vazia, e diz a quem quiser ler.
//
// A app tratava as duas da mesma maneira. Um roteiro público devolvia as datas
// a qualquer um, e a exportação iCal entregava-as num ficheiro pronto a
// importar para um calendário.
//
// A fronteira é a data de fim, e não precisa de configuração: viagem terminada
// mostra as datas a toda a gente, viagem por terminar só ao autor e a quem o
// segue. Quem quiser o contrário liga o shareUpcomingTrips.

let app
let viajante   // conta pública, com viagens
let estranho   // não segue ninguém

const HOJE = new Date()
const dia = (n) => new Date(HOJE.getTime() + n * 86400000).toISOString().slice(0, 10)

before(async () => { app = await criarApp() })
after(async () => { await fecharApp(app) })

beforeEach(async () => {
  await limparBaseDeDados()
  viajante = await registarUtilizador(app)
  estranho = await registarUtilizador(app)
})

async function criarViagem(token, { titulo, inicio, fim }) {
  const res = await app.inject({
    method: 'POST', url: '/itineraries',
    headers: comToken(token),
    payload: { title: titulo, destination: 'Açores', startDate: inicio, endDate: fim, data: { days: [] } },
  })
  if (res.statusCode >= 300) throw new Error(`criação falhou (${res.statusCode}): ${res.body}`)
  return JSON.parse(res.body)
}

const passada  = () => ({ titulo: 'Viagem que já aconteceu', inicio: dia(-30), fim: dia(-20) })
const aDecorrer = () => ({ titulo: 'Viagem a decorrer',      inicio: dia(-2),  fim: dia(3)   })
const futura   = () => ({ titulo: 'Viagem que aí vem',       inicio: dia(20),  fim: dia(30)  })

async function datasVistasPor(idViagem, token) {
  const res = await app.inject({
    method: 'GET', url: `/itineraries/${idViagem}`,
    headers: token ? comToken(token) : {},
  })
  assert.equal(res.statusCode, 200, `esperava 200, veio ${res.statusCode}`)
  const corpo = JSON.parse(res.body)
  return { startDate: corpo.startDate, endDate: corpo.endDate, title: corpo.title }
}

describe('datas de uma viagem por terminar', () => {
  test('não saem para quem não segue o autor', async () => {
    for (const molde of [aDecorrer(), futura()]) {
      const v = await criarViagem(viajante.accessToken, molde)
      const anon = await datasVistasPor(v.id, null)

      assert.equal(anon.startDate, null, `${molde.titulo}: a data de início saiu`)
      assert.equal(anon.endDate,   null, `${molde.titulo}: a data de fim saiu`)

      // O roteiro em si continua a aparecer — esconder as datas não é esconder
      // a viagem, senão perdia-se o conteúdo que dá vida ao explorar.
      assert.equal(anon.title, molde.titulo)
    }
  })

  test('uma viagem já terminada mostra as datas a toda a gente', async () => {
    const molde = passada()
    const v = await criarViagem(viajante.accessToken, molde)
    const anon = await datasVistasPor(v.id, null)

    assert.ok(anon.startDate, 'a data de início de uma viagem passada devia estar visível')
    assert.ok(anon.endDate,   'a data de fim de uma viagem passada devia estar visível')
  })

  test('o autor vê sempre as suas', async () => {
    const v = await criarViagem(viajante.accessToken, futura())
    const proprio = await datasVistasPor(v.id, viajante.accessToken)
    assert.ok(proprio.startDate, 'o autor deixou de ver as datas da sua própria viagem')
  })

  test('quem segue o autor vê', async () => {
    const v = await criarViagem(viajante.accessToken, futura())
    await app.inject({
      method: 'POST', url: `/users/${viajante.user.id}/follow`,
      headers: comToken(estranho.accessToken),
    })

    const seguidor = await datasVistasPor(v.id, estranho.accessToken)
    assert.ok(seguidor.startDate, 'quem segue devia ver as datas')
  })

  test('ligar shareUpcomingTrips abre-as a toda a gente', async () => {
    const v = await criarViagem(viajante.accessToken, futura())

    const antes = await datasVistasPor(v.id, null)
    assert.equal(antes.startDate, null)

    await app.inject({
      method: 'PATCH', url: '/users/me',
      headers: comToken(viajante.accessToken),
      payload: { shareUpcomingTrips: true },
    })

    const depois = await datasVistasPor(v.id, null)
    assert.ok(depois.startDate, 'com a partilha ligada as datas deviam sair')
  })

  test('a definição chega por omissão desligada', async () => {
    const res = await app.inject({
      method: 'GET', url: '/users/me', headers: comToken(viajante.accessToken),
    })
    assert.equal(JSON.parse(res.body).shareUpcomingTrips, false,
      'publicar uma ausência tem de ser uma escolha, não uma herança')
  })
})

describe('a exportação iCal', () => {
  // Este é o caso mais literal de todos: um .ics de uma viagem por terminar é
  // um calendário da ausência, pronto a importar.
  test('recusa uma viagem por terminar a quem não segue', async () => {
    const v = await criarViagem(viajante.accessToken, futura())
    const res = await app.inject({ method: 'GET', url: `/itineraries/${v.id}/export.ics` })
    assert.equal(res.statusCode, 403)
  })

  test('mas deixa passar uma já terminada, e o próprio autor sempre', async () => {
    const passadaV = await criarViagem(viajante.accessToken, passada())
    const anon = await app.inject({ method: 'GET', url: `/itineraries/${passadaV.id}/export.ics` })
    assert.equal(anon.statusCode, 200)

    const futuraV = await criarViagem(viajante.accessToken, futura())
    const proprio = await app.inject({
      method: 'GET', url: `/itineraries/${futuraV.id}/export.ics`,
      headers: comToken(viajante.accessToken),
    })
    assert.equal(proprio.statusCode, 200)
  })
})

describe('check-ins', () => {
  test('os de uma viagem por terminar não saem, os de uma terminada saem', async () => {
    const emCurso  = await criarViagem(viajante.accessToken, aDecorrer())
    const acabada  = await criarViagem(viajante.accessToken, passada())

    for (const [v, nome] of [[emCurso, 'agora'], [acabada, 'antes']]) {
      const res = await app.inject({
        method: 'POST', url: `/itineraries/${v.id}/checkin`,
        headers: comToken(viajante.accessToken),
        payload: { dayIndex: 0, activityIndex: 0, activityName: `estive-${nome}`, destination: 'Açores' },
      })
      assert.ok(res.statusCode < 300, `check-in falhou (${res.statusCode}): ${res.body}`)
    }

    const anon = await app.inject({ method: 'GET', url: `/users/${viajante.user.id}/checkins` })
    assert.equal(anon.statusCode, 200)
    assert.ok(!anon.body.includes('estive-agora'), 'um check-in de uma viagem a decorrer diz "estou fora agora"')
    assert.ok(anon.body.includes('estive-antes'),  'os check-ins passados são história e devem continuar visíveis')
  })
})

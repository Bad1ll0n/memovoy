import { test, describe, before, after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { query } from '../../src/db/pool.js'
import { criarApp, fecharApp, limparBaseDeDados, registarUtilizador, comToken } from './helpers.js'

// Roteiros com `data` malformado.
//
// A saída dos agentes passou a ser reparada antes de ser guardada, mas isso não
// arruma o que já lá está: tudo o que foi gerado antes disso continua na base de
// dados exactamente como o modelo o devolveu.
//
// Estes casos davam 500 a sério, confirmados antes da correcção: um dia sem
// `activities` rebentava no push, e `activities` como string rebentava no sort.

let app
let ana

before(async () => { app = await criarApp() })
after(async () => { await fecharApp(app) })

beforeEach(async () => {
  await limparBaseDeDados()
  ana = await registarUtilizador(app)
})

/** Cria um roteiro com o `data` exactamente como for pedido, sem passar pela API. */
async function roteiroCom(data) {
  const { rows } = await query(
    `INSERT INTO itineraries (user_id, title, destination, data)
     VALUES ($1, 'Roteiro', 'Lisboa', $2) RETURNING id`,
    [ana.user.id, JSON.stringify(data)],
  )
  return rows[0].id
}

const ACTIVIDADE = {
  time: '09:00', name: 'Nova', description: 'd', type: 'visit', currency: 'EUR',
}

const acrescentar = (id, dayIndex = 0) => app.inject({
  method: 'POST', url: `/itineraries/${id}/activity`,
  headers: comToken(ana.accessToken),
  payload: { dayIndex, activity: ACTIVIDADE },
})

describe('acrescentar actividade a um dia malformado', () => {
  test('dia sem activities aceita a primeira actividade', async () => {
    const id = await roteiroCom({ days: [{ day: 1, theme: 'Centro' }] })

    const res = await acrescentar(id)

    assert.equal(res.statusCode, 201, `devia aceitar, veio ${res.statusCode}: ${res.body}`)
    assert.equal(JSON.parse(res.body).activities.length, 1)
  })

  test('activities como string é substituído em vez de rebentar', async () => {
    const id = await roteiroCom({ days: [{ day: 1, activities: 'ups' }] })

    const res = await acrescentar(id)

    assert.equal(res.statusCode, 201, `veio ${res.statusCode}: ${res.body}`)

    const { rows } = await query('SELECT data FROM itineraries WHERE id = $1', [id])
    assert.ok(Array.isArray(rows[0].data.days[0].activities))
  })

  test('activities como objecto também', async () => {
    const id = await roteiroCom({ days: [{ day: 1, activities: { a: 1 } }] })

    const res = await acrescentar(id)

    assert.equal(res.statusCode, 201)
  })

  test('uma actividade antiga sem hora não impede acrescentar outra', async () => {
    // O dia é ordenado por `time`. Sem hora, o comparador rebentava — ou
    // passava, consoante a ordem em que fosse chamado. Passar por acaso é tão
    // mau como falhar.
    const id = await roteiroCom({
      days: [{ day: 1, activities: [{ name: 'Antiga, sem hora' }] }],
    })

    const res = await acrescentar(id)

    assert.equal(res.statusCode, 201, `veio ${res.statusCode}: ${res.body}`)
    assert.equal(JSON.parse(res.body).activities.length, 2)
  })

  test('as actividades ficam ordenadas por hora', async () => {
    const id = await roteiroCom({
      days: [{ day: 1, activities: [{ name: 'Tarde', time: '16:00' }] }],
    })

    await acrescentar(id)

    const { rows } = await query('SELECT data FROM itineraries WHERE id = $1', [id])
    const horas = rows[0].data.days[0].activities.map((a) => a.time)
    assert.deepEqual(horas, ['09:00', '16:00'])
  })
})

describe('remover actividade de um dia malformado', () => {
  test('activities que não é array devolve 400, não 500', async () => {
    const id = await roteiroCom({ days: [{ day: 1, activities: 'ups' }] })

    const res = await app.inject({
      method: 'DELETE', url: `/itineraries/${id}/activity?dayIndex=0&activityIndex=0`,
      headers: comToken(ana.accessToken),
    })

    assert.ok(res.statusCode < 500, `um pedido sobre dados maus é 4xx, veio ${res.statusCode}`)
  })
})

describe('ler um roteiro malformado', () => {
  test('não rebenta ao servir', async () => {
    const id = await roteiroCom({ days: [{ day: 1 }, { activities: 'x' }, null] })

    const res = await app.inject({
      method: 'GET', url: `/itineraries/${id}`,
      headers: comToken(ana.accessToken),
    })

    assert.equal(res.statusCode, 200, `veio ${res.statusCode}: ${res.body.slice(0, 120)}`)
  })
})

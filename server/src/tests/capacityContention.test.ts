/** Requirement 5, the hard part: the last seat can only be sold once.
 *  These tests hit the running HTTP server in parallel, so any read-then-write
 *  gap in the registration path shows up as an oversell. */
import { test, describe, before, after } from 'node:test'
import assert from 'node:assert/strict'

import {
  createEvent,
  errorBody,
  getEventDetail,
  register,
  startTestServer,
  type TestServer,
} from './helpers'

interface Tally { created: number; full: number; other: number[] }

async function stampede(
  srv: TestServer,
  eventId: string,
  attempts: number,
  namePrefix = 'Rusher',
): Promise<Tally> {
  const responses = await Promise.all(
    Array.from({ length: attempts }, (_, i) =>
      register(srv, eventId, `${namePrefix} ${i}`),
    ),
  )
  const tally: Tally = { created: 0, full: 0, other: [] }
  for (const res of responses) {
    if (res.status === 201) tally.created++
    else if (res.status === 409) {
      const err = await errorBody(res)
      err.code === 'EVENT_FULL' ? tally.full++ : tally.other.push(res.status)
    } else tally.other.push(res.status)
  }
  return tally
}

describe('the last seat under contention', () => {
  let srv: TestServer
  before(async () => { srv = await startTestServer() })
  after(async () => { await srv.close() })

  test('40 players racing for 8 seats fills exactly 8', async () => {
    const event = await createEvent(srv, {
      name: 'Draft stampede',
      gameId: 'mtg',
      eventType: 'DRAFT',
      capacity: 8,
    })

    const tally = await stampede(srv, event.id, 40)
    assert.deepEqual(tally.other, [], 'unexpected statuses under load')
    assert.equal(tally.created, 8, 'the event was over- or under-sold')
    assert.equal(tally.full, 32)
  })

  test('the stored registrations match the successful responses', async () => {
    const event = await createEvent(srv, {
      name: 'Sealed stampede',
      gameId: 'mtg',
      eventType: 'SEALED',
      capacity: 24,
    })

    const tally = await stampede(srv, event.id, 90, 'Sealed player')
    const detail = await getEventDetail(srv, event.id)

    assert.equal(tally.created, 24)
    assert.equal(detail.registeredCount, 24)
    assert.equal(detail.registrations.length, 24)
    assert.equal(detail.isFull, true)
  })

  test('exactly one player wins a single remaining seat', async () => {
    const event = await createEvent(srv, {
      name: 'One seat left',
      gameId: 'mtg',
      eventType: 'DRAFT',
      capacity: 8,
    })
    for (let i = 0; i < 7; i++) {
      assert.equal((await register(srv, event.id, `Early ${i}`)).status, 201)
    }

    const tally = await stampede(srv, event.id, 25, 'Latecomer')
    assert.equal(tally.created, 1, 'the final seat was not sold exactly once')
    assert.equal(tally.full, 24)
  })

  test('a full 30-player event never exceeds 30', async () => {
    const event = await createEvent(srv, {
      name: 'Max capacity',
      gameId: 'mtg',
      eventType: 'SEALED',
      capacity: 30,
    })

    await stampede(srv, event.id, 75, 'Max player')
    const detail = await getEventDetail(srv, event.id)
    assert.equal(detail.registeredCount, 30)
  })

  test('parallel duplicates of one name only take one seat', async () => {
    const event = await createEvent(srv, {
      name: 'Double click',
      gameId: 'mtg',
      eventType: 'DRAFT',
      capacity: 8,
    })

    const responses = await Promise.all(
      Array.from({ length: 10 }, () => register(srv, event.id, 'Impatient Player')),
    )
    assert.equal(responses.filter((r) => r.status === 201).length, 1)

    const detail = await getEventDetail(srv, event.id)
    assert.equal(detail.registeredCount, 1)
  })

  test('contention on one event does not consume another event seats', async () => {
    const [busy, quiet] = await Promise.all([
      createEvent(srv, { name: 'Busy', gameId: 'mtg', eventType: 'DRAFT', capacity: 8 }),
      createEvent(srv, { name: 'Quiet', gameId: 'mtg', eventType: 'DRAFT', capacity: 8 }),
    ])

    await stampede(srv, busy.id, 40, 'Busy player')

    const quietDetail = await getEventDetail(srv, quiet.id)
    assert.equal(quietDetail.registeredCount, 0)
    assert.equal(quietDetail.isFull, false)
  })
})

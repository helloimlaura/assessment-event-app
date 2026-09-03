/** Requirement 5: registration link + QR, with capacity enforced server-side. */
import { test, describe, before, after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'

import {
  createEvent,
  errorBody,
  getEventDetail,
  PUBLIC_BASE_URL,
  register,
  startTestServer,
  type TestServer,
} from './helpers'
import type { EventSummary, RegisterResponse } from '../../../shared/types'

describe('the registration link a QR code encodes', () => {
  let srv: TestServer
  let event: EventSummary
  before(async () => {
    srv = await startTestServer()
    event = await createEvent(srv)
  })
  after(async () => { await srv.close() })

  test('the event detail exposes a registration url', async () => {
    const detail = await getEventDetail(srv, event.id)
    assert.ok(detail.registrationUrl, 'event detail has no registrationUrl to encode')
  })

  test('the url is absolute, so a scanned QR works off-device', async () => {
    const { registrationUrl } = await getEventDetail(srv, event.id)
    const parsed = new URL(registrationUrl) // throws if relative
    assert.ok(['http:', 'https:'].includes(parsed.protocol))
    assert.ok(registrationUrl.startsWith(PUBLIC_BASE_URL), registrationUrl)
  })

  test('the url identifies this event', async () => {
    const { registrationUrl } = await getEventDetail(srv, event.id)
    assert.ok(registrationUrl.includes(event.id), registrationUrl)
  })

  test('the url is stable across requests', async () => {
    const a = await getEventDetail(srv, event.id)
    const b = await getEventDetail(srv, event.id)
    assert.equal(a.registrationUrl, b.registrationUrl)
  })

  test('two events get different registration urls', async () => {
    const other = await createEvent(srv, { name: 'Saturday Sealed' })
    const [a, b] = await Promise.all([
      getEventDetail(srv, event.id),
      getEventDetail(srv, other.id),
    ])
    assert.notEqual(a.registrationUrl, b.registrationUrl)
  })
})

describe('registering a player', () => {
  let srv: TestServer
  let event: EventSummary
  beforeEach(async () => {
    if (srv) await srv.close()
    srv = await startTestServer()
    event = await createEvent(srv, { gameId: 'mtg', eventType: 'DRAFT', capacity: 8 })
  })
  after(async () => { await srv.close() })

  test('a name alone is enough to register', async () => {
    const res = await register(srv, event.id, 'Ajani Goldmane')
    assert.equal(res.status, 201)

    const body = (await res.json()) as RegisterResponse
    assert.equal(body.registration.playerName, 'Ajani Goldmane')
    assert.ok(body.registration.id)
    assert.ok(Date.parse(body.registration.registeredAt) > 0)
  })

  test('the response reports the seats taken and the capacity', async () => {
    const res = await register(srv, event.id, 'Jace Beleren')
    const body = (await res.json()) as RegisterResponse
    assert.equal(body.event.registeredCount, 1)
    assert.equal(body.event.capacity, 8)
  })

  test('registrations accumulate on the event', async () => {
    await register(srv, event.id, 'Liliana Vess')
    await register(srv, event.id, 'Chandra Nalaar')

    const detail = await getEventDetail(srv, event.id)
    assert.equal(detail.registeredCount, 2)
    assert.deepEqual(
      detail.registrations.map((r) => r.playerName).sort(),
      ['Chandra Nalaar', 'Liliana Vess'],
    )
  })

  test('a blank name is rejected', async () => {
    const res = await register(srv, event.id, '   ')
    assert.equal(res.status, 422)

    const err = await errorBody(res)
    assert.equal(err.code, 'VALIDATION_FAILED')
    assert.ok(err.fields && 'playerName' in err.fields)
  })

  test('the same player cannot take two seats', async () => {
    assert.equal((await register(srv, event.id, 'Nissa Revane')).status, 201)

    const dupe = await register(srv, event.id, 'Nissa Revane')
    assert.equal(dupe.status, 409)
    assert.equal((await errorBody(dupe)).code, 'DUPLICATE_REGISTRATION')

    const detail = await getEventDetail(srv, event.id)
    assert.equal(detail.registeredCount, 1)
  })

  test('registering for an event that does not exist is a 404', async () => {
    const res = await register(srv, 'no-such-event', 'Garruk Wildspeaker')
    assert.equal(res.status, 404)
    assert.equal((await errorBody(res)).code, 'NOT_FOUND')
  })

  test('the event reports whether it has the minimum players to fire', async () => {
    const before = await getEventDetail(srv, event.id)
    assert.equal(before.meetsMinimum, false)

    for (let i = 0; i < before.minPlayers; i++) {
      assert.equal((await register(srv, event.id, `Player ${i}`)).status, 201)
    }

    const after = await getEventDetail(srv, event.id)
    assert.equal(after.meetsMinimum, true)
  })
})

describe('capacity enforcement', () => {
  let srv: TestServer
  let event: EventSummary
  before(async () => {
    srv = await startTestServer()
    event = await createEvent(srv, { gameId: 'mtg', eventType: 'DRAFT', capacity: 8 })
    for (let i = 0; i < 8; i++) {
      const res = await register(srv, event.id, `Player ${i}`)
      assert.equal(res.status, 201, `seat ${i} should have been available`)
    }
  })
  after(async () => { await srv.close() })

  test('the event is full once every seat is taken', async () => {
    const detail = await getEventDetail(srv, event.id)
    assert.equal(detail.registeredCount, 8)
    assert.equal(detail.isFull, true)
  })

  test('a registration past capacity is rejected with EVENT_FULL', async () => {
    const res = await register(srv, event.id, 'One Too Many')
    assert.equal(res.status, 409)
    assert.equal((await errorBody(res)).code, 'EVENT_FULL')
  })

  test('the rejection message tells the player why in plain language', async () => {
    const err = await errorBody(await register(srv, event.id, 'Also Too Late'))
    assert.match(err.message, /full/i)
  })

  test('a rejected registration does not increase the count', async () => {
    await register(srv, event.id, 'Rejected Player')
    const detail = await getEventDetail(srv, event.id)
    assert.equal(detail.registeredCount, 8)
    assert.ok(
      !detail.registrations.some((r) => r.playerName === 'Rejected Player'),
      'a rejected player was still written to the event',
    )
  })

  test('capacity is enforced by the server, not the client', async () => {
    // No UI in the loop at all here: a bare HTTP call is still refused.
    const res = await fetch(`${srv.url}/api/events/${event.id}/registrations`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ playerName: 'Curl User' }),
    })
    assert.equal(res.status, 409)
  })
})

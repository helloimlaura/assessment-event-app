/** Requirement 1: an organizer can create an event with a name, game, start
 *  date/time and capacity, supporting up to 30 players. */
import { test, describe, before, after } from 'node:test'
import assert from 'node:assert/strict'

import {
  createEvent,
  errorBody,
  getEventDetail,
  postEvent,
  startTestServer,
  VALID_EVENT,
  type TestServer,
} from './helpers'

describe('creating an event', () => {
  let srv: TestServer
  before(async () => { srv = await startTestServer() })
  after(async () => { await srv.close() })

  test('returns 201 and the created event', async () => {
    const res = await postEvent(srv)
    assert.equal(res.status, 201)

    const { event } = (await res.json()) as { event: { id: string; name: string } }
    assert.ok(event.id, 'created event has no id')
    assert.equal(event.name, VALID_EVENT.name)
  })

  test('records the game, event type, start time, location and capacity', async () => {
    const event = await createEvent(srv)
    assert.equal(event.game.id, 'mtg')
    assert.equal(event.eventType, 'DRAFT')
    assert.equal(event.location, VALID_EVENT.location)
    assert.equal(event.capacity, 16)
    assert.equal(Date.parse(event.startsAt), Date.parse(VALID_EVENT.startsAt))
  })

  test('normalizes the start time to UTC', async () => {
    // 18:00 Pacific on 2026-10-16 is 01:00 UTC the next day.
    const event = await createEvent(srv, { startsAt: '2026-10-16T18:00:00-07:00' })
    assert.equal(event.startsAt, '2026-10-17T01:00:00.000Z')
  })

  test('a created event can be read back by id', async () => {
    const created = await createEvent(srv)
    const detail = await getEventDetail(srv, created.id)
    assert.equal(detail.id, created.id)
    assert.equal(detail.name, created.name)
  })

  test('a new event starts with no registrations and is not full', async () => {
    const event = await createEvent(srv)
    assert.equal(event.registeredCount, 0)
    assert.equal(event.isFull, false)
  })

  test('supports a capacity of 30 players', async () => {
    const event = await createEvent(srv, {
      gameId: 'mtg',
      eventType: 'SEALED',
      capacity: 30,
    })
    assert.equal(event.capacity, 30)
  })

  test('unknown event ids are 404 NOT_FOUND', async () => {
    const res = await fetch(`${srv.url}/api/events/does-not-exist`)
    assert.equal(res.status, 404)
    assert.equal((await errorBody(res)).code, 'NOT_FOUND')
  })
})

describe('rejecting bad event input', () => {
  let srv: TestServer
  before(async () => { srv = await startTestServer() })
  after(async () => { await srv.close() })

  const cases: { why: string; patch: Record<string, unknown>; field: string }[] = [
    { why: 'a missing name', patch: { name: undefined }, field: 'name' },
    { why: 'a blank name', patch: { name: '   ' }, field: 'name' },
    { why: 'a missing game', patch: { gameId: undefined }, field: 'gameId' },
    { why: 'a missing start time', patch: { startsAt: undefined }, field: 'startsAt' },
    { why: 'an unparseable start time', patch: { startsAt: 'next tuesday' }, field: 'startsAt' },
    { why: 'a missing location', patch: { location: undefined }, field: 'location' },
    { why: 'a capacity of zero', patch: { capacity: 0 }, field: 'capacity' },
    { why: 'a negative capacity', patch: { capacity: -4 }, field: 'capacity' },
    { why: 'a fractional capacity', patch: { capacity: 8.5 }, field: 'capacity' },
    { why: 'a capacity over 30', patch: { capacity: 31 }, field: 'capacity' },
  ]

  for (const { why, patch, field } of cases) {
    test(`rejects ${why} with a message naming the field`, async () => {
      const res = await postEvent(srv, patch)
      assert.equal(res.status, 422, `expected 422 for ${why}`)

      const err = await errorBody(res)
      assert.equal(err.code, 'VALIDATION_FAILED')
      assert.ok(err.message.length > 0, 'error carries no human-readable message')
      assert.ok(
        err.fields && field in err.fields,
        `expected fields.${field}, got ${JSON.stringify(err.fields)}`,
      )
    })
  }

  test('rejects a capacity above the maximum the game template allows', async () => {
    // mtg/DRAFT caps below 30; the template, not the global limit, decides.
    const res = await postEvent(srv, { gameId: 'mtg', eventType: 'DRAFT', capacity: 30 })
    assert.equal(res.status, 422)

    const err = await errorBody(res)
    assert.equal(err.code, 'VALIDATION_FAILED')
    assert.ok(err.fields && 'capacity' in err.fields)
  })

  test('rejects a capacity below the minimum players needed to fire', async () => {
    const res = await postEvent(srv, { gameId: 'mtg', eventType: 'DRAFT', capacity: 2 })
    assert.equal(res.status, 422)
    assert.equal((await errorBody(res)).code, 'VALIDATION_FAILED')
  })

  test('rejects a malformed body without crashing the server', async () => {
    const res = await fetch(`${srv.url}/api/events`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{ not json',
    })
    // 400, not 422: the request could not be parsed at all, so there was
    // never a well-formed event for the domain to reject.
    assert.equal(res.status, 400)
    assert.equal((await errorBody(res)).code, 'MALFORMED_BODY')

    // still alive
    const ok = await postEvent(srv)
    assert.equal(ok.status, 201)
  })
})

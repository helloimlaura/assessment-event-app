/** Requirement 3: scheduled events are visible per day on a calendar. */
import { test, describe, before, after } from 'node:test'
import assert from 'node:assert/strict'

import { createEvent, startTestServer, type TestServer } from './helpers'
import { groupEventsByDay } from '../../../shared/calendar'
import type { EventSummary } from '../../../shared/types'

const SEATTLE = 'America/Los_Angeles'

function summary(id: string, startsAt: string, durationMin = 180): EventSummary {
  return {
    id,
    name: `Event ${id}`,
    game: { id: 'mtg', name: 'Magic: The Gathering' },
    eventType: 'DRAFT',
    eventTypeLabel: 'Booster Draft',
    startsAt,
    endsAt: new Date(Date.parse(startsAt) + durationMin * 60_000).toISOString(),
    location: 'Card Kingdom',
    capacity: 16,
    registeredCount: 0,
    isFull: false,
  }
}

describe('grouping events by day', () => {
  test('no events produces no days', () => {
    assert.deepEqual(groupEventsByDay([], SEATTLE), [])
  })

  test('events on the same local day land in one group', () => {
    const days = groupEventsByDay(
      [
        summary('a', '2026-10-16T18:00:00-07:00'),
        summary('b', '2026-10-16T11:00:00-07:00'),
      ],
      SEATTLE,
    )
    assert.equal(days.length, 1)
    assert.equal(days[0].date, '2026-10-16')
    assert.equal(days[0].events.length, 2)
  })

  test('events within a day are ordered by start time', () => {
    const days = groupEventsByDay(
      [
        summary('evening', '2026-10-16T18:00:00-07:00'),
        summary('morning', '2026-10-16T11:00:00-07:00'),
      ],
      SEATTLE,
    )
    assert.deepEqual(days[0].events.map((e) => e.id), ['morning', 'evening'])
  })

  test('days are ordered earliest first', () => {
    const days = groupEventsByDay(
      [
        summary('later', '2026-10-18T18:00:00-07:00'),
        summary('earlier', '2026-10-16T18:00:00-07:00'),
        summary('middle', '2026-10-17T18:00:00-07:00'),
      ],
      SEATTLE,
    )
    assert.deepEqual(days.map((d) => d.date), ['2026-10-16', '2026-10-17', '2026-10-18'])
  })

  test('a day is the organizer local day, not the UTC day', () => {
    // 2026-10-17T01:00Z is still Friday the 16th in Seattle.
    const days = groupEventsByDay([summary('a', '2026-10-17T01:00:00Z')], SEATTLE)
    assert.equal(days[0].date, '2026-10-16')
  })

  test('the same event falls on different days in different time zones', () => {
    const [seattle] = groupEventsByDay([summary('a', '2026-10-17T01:00:00Z')], SEATTLE)
    const [utc] = groupEventsByDay([summary('a', '2026-10-17T01:00:00Z')], 'UTC')
    assert.equal(seattle.date, '2026-10-16')
    assert.equal(utc.date, '2026-10-17')
  })
})

describe('listing events for the calendar', () => {
  let srv: TestServer
  before(async () => { srv = await startTestServer() })
  after(async () => { await srv.close() })

  test('an empty schedule returns an empty list', async () => {
    const res = await fetch(`${srv.url}/api/events`)
    assert.equal(res.status, 200)

    const { events } = (await res.json()) as { events: unknown[] }
    assert.deepEqual(events, [])
  })

  test('returns created events ordered by start time', async () => {
    await createEvent(srv, { name: 'Sunday', startsAt: '2026-11-08T12:00:00Z' })
    await createEvent(srv, { name: 'Friday', startsAt: '2026-11-06T12:00:00Z' })
    await createEvent(srv, { name: 'Saturday', startsAt: '2026-11-07T12:00:00Z' })

    const res = await fetch(`${srv.url}/api/events`)
    const { events } = (await res.json()) as { events: { name: string }[] }
    assert.deepEqual(events.map((e) => e.name), ['Friday', 'Saturday', 'Sunday'])
  })

  test('a from/to window excludes events outside it', async () => {
    const res = await fetch(
      `${srv.url}/api/events?from=2026-11-07T00:00:00Z&to=2026-11-08T00:00:00Z`,
    )
    assert.equal(res.status, 200)

    const { events } = (await res.json()) as { events: { name: string }[] }
    assert.deepEqual(events.map((e) => e.name), ['Saturday'])
  })

  test('the window is inclusive of from and exclusive of to', async () => {
    const res = await fetch(
      `${srv.url}/api/events?from=2026-11-06T12:00:00Z&to=2026-11-08T12:00:00Z`,
    )
    const { events } = (await res.json()) as { events: { name: string }[] }
    assert.deepEqual(events.map((e) => e.name), ['Friday', 'Saturday'])
  })

  test('list entries carry what a calendar cell needs to render', async () => {
    const res = await fetch(`${srv.url}/api/events`)
    const { events } = (await res.json()) as { events: Record<string, unknown>[] }
    for (const key of [
      'id', 'name', 'game', 'eventTypeLabel', 'startsAt', 'endsAt',
      'location', 'capacity', 'registeredCount', 'isFull',
    ]) {
      assert.ok(key in events[0], `calendar list entry is missing "${key}"`)
    }
  })

  test('a malformed window is rejected rather than silently ignored', async () => {
    const res = await fetch(`${srv.url}/api/events?from=whenever`)
    // 422 for the same reason an unparseable startsAt in a body is 422: the
    // query string parsed fine; the value in it is what the domain refuses.
    assert.equal(res.status, 422)
  })
})

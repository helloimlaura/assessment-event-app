/** Requirement 4: the event page offers a downloadable .ics invite that
 *  Google Calendar / Outlook can import, with the right title, times and place. */
import { test, describe, before, after } from 'node:test'
import assert from 'node:assert/strict'

import {
  createEvent,
  errorBody,
  startTestServer,
  VALID_EVENT,
  type TestServer,
} from './helpers'
import type { EventSummary } from '../../../shared/types'

const BACKSLASH = String.fromCharCode(92)
/** Matches an ics-escaped sequence: backslash followed by , ; or backslash. */
const ESCAPED = new RegExp(BACKSLASH + BACKSLASH + '([,;' + BACKSLASH + BACKSLASH + '])', 'g')
const ESCAPED_NEWLINE = new RegExp(BACKSLASH + BACKSLASH + 'n', 'g')
/** A comma that is NOT preceded by a backslash — i.e. one left unescaped. */
const UNESCAPED_COMMA = new RegExp('[^' + BACKSLASH + BACKSLASH + '],')

/** Undo RFC 5545 line folding, then read single-valued properties. */
function parseIcs(raw: string): { lines: string[]; get: (name: string) => string } {
  const lines = raw.replace(/\r\n[ \t]/g, '').split('\r\n')
  return {
    lines,
    get(name) {
      const line = lines.find(
        (l) => l.startsWith(`${name}:`) || l.startsWith(`${name};`),
      )
      assert.ok(line, `no ${name} property in:\n${raw}`)
      const value = line.slice(line.indexOf(':') + 1)
      return value.replace(ESCAPED, '$1').replace(ESCAPED_NEWLINE, '\n')
    },
  }
}

/** 2026-10-17T01:00:00.000Z -> 20261017T010000Z */
function icsUtc(iso: string): string {
  return new Date(iso).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
}

describe('calendar invite download', () => {
  let srv: TestServer
  let event: EventSummary
  let raw: string
  let res: Response

  before(async () => {
    srv = await startTestServer()
    event = await createEvent(srv)
    res = await fetch(`${srv.url}/api/events/${event.id}/calendar.ics`)
    raw = await res.text()
  })
  after(async () => {
    await srv.close()
  })

  test('is served with 200 and a calendar content type', () => {
    assert.equal(res.status, 200)
    assert.match(res.headers.get('content-type') ?? '', /text\/calendar/)
  })

  test('is offered as a download with an .ics filename', () => {
    const disposition = res.headers.get('content-disposition') ?? ''
    assert.match(disposition, /attachment/)
    assert.match(disposition, /filename=.*\.ics/)
  })

  test('is a well-formed single-event VCALENDAR', () => {
    const { lines } = parseIcs(raw)
    assert.equal(lines[0], 'BEGIN:VCALENDAR')
    assert.ok(lines.includes('END:VCALENDAR'), 'no END:VCALENDAR')
    assert.equal(lines.filter((l) => l === 'BEGIN:VEVENT').length, 1)
    assert.equal(lines.filter((l) => l === 'END:VEVENT').length, 1)
  })

  test('uses CRLF line endings as RFC 5545 requires', () => {
    assert.ok(raw.includes('\r\n'), 'ics uses bare LF; Outlook will choke on it')
    assert.ok(!/[^\r]\n/.test(raw), 'ics contains a bare LF line ending')
  })

  test('declares iCalendar 2.0 and a product id', () => {
    const ics = parseIcs(raw)
    assert.equal(ics.get('VERSION'), '2.0')
    assert.ok(ics.get('PRODID').length > 0)
  })

  test('the title is the event name', () => {
    assert.equal(parseIcs(raw).get('SUMMARY'), VALID_EVENT.name)
  })

  test('the start time matches the event, in UTC', () => {
    assert.equal(parseIcs(raw).get('DTSTART'), icsUtc(event.startsAt))
  })

  test('the end time matches the template-driven event end, in UTC', () => {
    assert.equal(parseIcs(raw).get('DTEND'), icsUtc(event.endsAt))
  })

  test('the location is the venue the organizer entered', () => {
    assert.equal(parseIcs(raw).get('LOCATION'), VALID_EVENT.location)
  })

  test('carries a UID and DTSTAMP so re-imports update rather than duplicate', () => {
    const ics = parseIcs(raw)
    assert.ok(ics.get('UID').includes(event.id), 'UID is not tied to the event id')
    assert.ok(ics.get('DTSTAMP').length > 0)
  })

  test('two events get different UIDs', async () => {
    const other = await createEvent(srv, { name: 'Sunday Sealed' })
    const otherRaw = await (
      await fetch(`${srv.url}/api/events/${other.id}/calendar.ics`)
    ).text()
    assert.notEqual(parseIcs(raw).get('UID'), parseIcs(otherRaw).get('UID'))
  })

  test('the same event exports the same UID twice', async () => {
    const again = await (
      await fetch(`${srv.url}/api/events/${event.id}/calendar.ics`)
    ).text()
    assert.equal(parseIcs(again).get('UID'), parseIcs(raw).get('UID'))
  })

  test('the invite points players at the registration link', () => {
    assert.ok(raw.includes(event.id), 'the invite does not mention the event id')
  })

  test('commas in the venue are escaped, not left to break the field', () => {
    const locationLine = parseIcs(raw).lines.find((l) => l.startsWith('LOCATION:'))
    assert.ok(locationLine, 'no LOCATION line')
    // "Card Kingdom, 5105 Leary Ave NW, Seattle, WA" needs escaped commas.
    assert.ok(
      !UNESCAPED_COMMA.test(locationLine.slice('LOCATION:'.length)),
      `unescaped comma in ${locationLine}`,
    )
  })

  test('an unknown event has no invite', async () => {
    const missing = await fetch(`${srv.url}/api/events/nope/calendar.ics`)
    assert.equal(missing.status, 404)
    assert.equal((await errorBody(missing)).code, 'NOT_FOUND')
  })
})

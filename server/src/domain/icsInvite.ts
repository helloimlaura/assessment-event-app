/** Requirement 4: the downloadable .ics invite the event page offers.
 *
 *  RFC 5545 plumbing — CRLF line endings, 75-octet folding, escaping the
 *  commas in "Card Kingdom, 5105 Leary Ave NW, Seattle, WA" — is the `ics`
 *  package's job. What this module owns is the mapping from an EventDetail to
 *  that package's input, and the two decisions the package cannot make for us:
 *  a UID that is stable across exports, and times pinned to UTC.
 */
import { createEvent } from 'ics'
import type { DateArray } from 'ics'

import type { EventDetail } from '../../../shared/types'

const PRODUCT_ID = '-//wotc-event-app//Event Invite//EN'

/** `ics` wants [year, month, day, hour, minute] with month 1-based.
 *
 *  Read with UTC getters, paired with `startInputType: 'utc'` below. Local
 *  getters here would silently shift DTSTART and DTEND by the server's offset
 *  — the invite would still import cleanly, just at the wrong time. */
function toUtcParts(iso: string): DateArray {
  const at = new Date(iso)
  return [
    at.getUTCFullYear(),
    at.getUTCMonth() + 1,
    at.getUTCDate(),
    at.getUTCHours(),
    at.getUTCMinutes(),
  ]
}

/** A calendar treats UID as the identity of the event: re-importing the same
 *  UID updates the entry an organizer already has, while a fresh one leaves
 *  them holding two copies of the same draft. So it is derived from the event
 *  id and the advertised origin, never generated — `ics` would otherwise mint
 *  a random one on every request. */
function uidFor(event: EventDetail, publicBaseUrl: string): string {
  let host = 'wotc-event-app'
  try {
    host = new URL(publicBaseUrl).host
  } catch {
    // A malformed origin should not cost the organizer their invite; the id
    // alone still identifies the event.
  }
  return `${event.id}@${host}`
}

/** Safe for a Content-Disposition filename and still recognisable in a
 *  downloads folder: "Friday Night Magic" -> "friday-night-magic.ics". */
function filenameFor(event: EventDetail): string {
  const slug = event.name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return `${slug === '' ? 'event' : slug}.ics`
}

export interface Invite {
  filename: string
  body: string
}

/** Returns undefined only if `ics` refuses the attributes, which callers turn
 *  into a 500: a half-serialized calendar is worse than a clear failure. */
export function buildInvite(
  event: EventDetail,
  publicBaseUrl: string,
): Invite | undefined {
  const { error, value } = createEvent({
    uid: uidFor(event, publicBaseUrl),
    productId: PRODUCT_ID,
    title: event.name,
    location: event.location,
    // Both ends come from the event as stored, so the invite cannot disagree
    // with the schedule; `endsAt` is already the template-driven duration.
    start: toUtcParts(event.startsAt),
    startInputType: 'utc',
    startOutputType: 'utc',
    end: toUtcParts(event.endsAt),
    endInputType: 'utc',
    endOutputType: 'utc',
    // Whoever opens the invite is one tap from the seat they came for.
    description:
      `${event.game.name} — ${event.eventTypeLabel}\n` +
      `Register: ${event.registrationUrl}`,
    url: event.registrationUrl,
  })

  // `ics` types `value` as `string | null`, so null is the case to rule out
  // here — checking for undefined would compile against nothing.
  if (error !== null || value === null) {
    console.error('ics serialization failed', error)
    return undefined
  }

  return { filename: filenameFor(event), body: value }
}

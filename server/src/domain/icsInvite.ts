/** Requirement 4: the downloadable .ics invite the event page offers.
 *
 *  RFC 5545 plumbing — CRLF endings, line folding, escaping commas in a venue
 *  address — is the `ics` package's job. This module owns the mapping to it,
 *  and the two decisions the package cannot make for us.
 */
import { createEvent } from 'ics'
import type { DateArray } from 'ics'

import type { EventDetail } from '../../../shared/types'

const PRODUCT_ID = '-//wotc-event-app//Event Invite//EN'

/** UTC getters, paired with `startInputType: 'utc'` below. Local getters here
 *  would shift DTSTART and DTEND by the server's offset — the invite still
 *  imports cleanly, just at the wrong time. */
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

/** A calendar treats UID as the event's identity: the same one updates an entry
 *  the organizer already has, a fresh one leaves them holding two copies. So it
 *  is derived, never generated — `ics` would otherwise mint a random one per
 *  request. */
function uidFor(event: EventDetail, publicBaseUrl: string): string {
  let host = 'wotc-event-app'
  try {
    host = new URL(publicBaseUrl).host
  } catch {
    // The id alone still identifies the event.
  }
  return `${event.id}@${host}`
}

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

/** Undefined only if `ics` refuses the attributes, which the route turns into a
 *  500: a half-serialized calendar is worse than a clear failure. */
export function buildInvite(
  event: EventDetail,
  publicBaseUrl: string,
): Invite | undefined {
  const { error, value } = createEvent({
    uid: uidFor(event, publicBaseUrl),
    productId: PRODUCT_ID,
    title: event.name,
    location: event.location,
    // Both ends come from the stored event, so the invite cannot disagree with
    // the schedule about when the draft fires.
    start: toUtcParts(event.startsAt),
    startInputType: 'utc',
    startOutputType: 'utc',
    end: toUtcParts(event.endsAt),
    endInputType: 'utc',
    endOutputType: 'utc',
    description:
      `${event.game.name} — ${event.eventTypeLabel}\n` +
      `Register: ${event.registrationUrl}`,
    url: event.registrationUrl,
  })

  // `ics` types `value` as `string | null`, so null is the case to rule out.
  if (error !== null || value === null) {
    console.error('ics serialization failed', error)
    return undefined
  }

  return { filename: filenameFor(event), body: value }
}

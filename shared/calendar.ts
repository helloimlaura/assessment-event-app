import type { EventSummary } from './types'

export interface CalendarDay {
  /** YYYY-MM-DD in the organizer's time zone. */
  date: string
  events: EventSummary[]
}

/** Which local day an instant falls on, as YYYY-MM-DD.
 *
 *  `en-CA` is the lever: its short date format is already ISO-ordered, so the
 *  formatter hands back "2026-10-16" for the requested zone with no offset
 *  arithmetic of ours to get wrong across DST boundaries. A 01:00Z start is
 *  the previous day in Seattle, and this is what says so. */
function localDay(isoInstant: string, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(isoInstant))
}

/** Bucket events into local days, earliest first, each day's events ordered by
 *  start time.
 *
 *  The time zone is a parameter rather than the host's, because the day an
 *  event belongs to is a property of where the store is, not of where the
 *  process happens to run. */
export function groupEventsByDay(
  events: EventSummary[],
  timeZone: string,
): CalendarDay[] {
  const byDate = new Map<string, EventSummary[]>()

  for (const event of events) {
    const date = localDay(event.startsAt, timeZone)
    const day = byDate.get(date)
    if (day === undefined) byDate.set(date, [event])
    else day.push(event)
  }

  return [...byDate.entries()]
    // Dates are zero-padded ISO, so lexicographic order is chronological.
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, dayEvents]) => ({
      date,
      events: [...dayEvents].sort((a, b) => a.startsAt.localeCompare(b.startsAt)),
    }))
}

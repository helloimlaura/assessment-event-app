/** Local-time formatting, in one place.
 *
 *  The agenda and the event page have to render the same instant the same way,
 *  and every one of these formatters carries a time-zone decision that is easy
 *  to get subtly wrong. Duplicating them per component is how the two views
 *  drift apart by an hour.
 */

/** The zone the organizer is standing in. Which day an event belongs to is a
 *  local question, so this is the answer the grouping and every rendered time
 *  are given. */
export const TIME_ZONE = Intl.DateTimeFormat().resolvedOptions().timeZone

/** A `CalendarDay.date` is a plain calendar date, not an instant, so it is
 *  formatted as UTC on purpose: reading "2026-10-16" as midnight *local* and
 *  then formatting it would slide the heading to the 15th anywhere west of
 *  Greenwich. */
const DAY_HEADING = new Intl.DateTimeFormat(undefined, {
  weekday: 'long',
  month: 'long',
  day: 'numeric',
  year: 'numeric',
  timeZone: 'UTC',
})

/** The same words as `DAY_HEADING`, but for a real instant, which does belong
 *  in the viewer's zone. */
const INSTANT_DATE = new Intl.DateTimeFormat(undefined, {
  weekday: 'long',
  month: 'long',
  day: 'numeric',
  year: 'numeric',
  timeZone: TIME_ZONE,
})

const CLOCK = new Intl.DateTimeFormat(undefined, {
  hour: 'numeric',
  minute: '2-digit',
  timeZone: TIME_ZONE,
})

/** Takes a plain `YYYY-MM-DD`, as `CalendarDay.date` carries. */
export function formatDayHeading(date: string): string {
  return DAY_HEADING.format(new Date(`${date}T00:00:00Z`))
}

/** Takes a UTC ISO instant. */
export function formatEventDate(iso: string): string {
  return INSTANT_DATE.format(new Date(iso))
}

/** Takes a UTC ISO instant. */
export function formatClock(iso: string): string {
  return CLOCK.format(new Date(iso))
}

import type { EventSummary } from './types'

export interface CalendarDay {
  /** YYYY-MM-DD in the organizer's time zone. */
  date: string
  events: EventSummary[]
}

/** TODO(green): bucket events into local days, earliest first. */
export function groupEventsByDay(
  _events: EventSummary[],
  _timeZone: string,
): CalendarDay[] {
  throw new Error('not implemented: groupEventsByDay')
}

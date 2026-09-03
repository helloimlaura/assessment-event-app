import { useEffect, useState } from 'react'

import { groupEventsByDay } from '../../../shared/calendar'
import type { CalendarDay } from '../../../shared/calendar'
import type { EventSummary } from '../../../shared/types'
import './EventAgenda.css'

export interface EventAgendaProps {
  /** Changed by the caller when the schedule may have moved on — creating an
   *  event bumps it — which is what makes the list refetch. */
  refreshKey?: number
}

/** The zone the organizer is standing in. Which day an event belongs to is a
 *  local question, so this is the answer the grouping and every rendered time
 *  are given. */
const TIME_ZONE = Intl.DateTimeFormat().resolvedOptions().timeZone

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

const CLOCK = new Intl.DateTimeFormat(undefined, {
  hour: 'numeric',
  minute: '2-digit',
  timeZone: TIME_ZONE,
})

/** Midnight this morning, not this instant: an organizer checking the day's
 *  schedule still wants the draft that fired an hour ago on the list. */
function startOfToday(): string {
  const midnight = new Date()
  midnight.setHours(0, 0, 0, 0)
  return midnight.toISOString()
}

export function EventAgenda({ refreshKey }: EventAgendaProps) {
  const [days, setDays] = useState<CalendarDay[]>([])
  const [status, setStatus] = useState('Loading the schedule…')

  useEffect(() => {
    let current = true

    fetch(`/api/events?from=${encodeURIComponent(startOfToday())}`)
      .then((res) => {
        if (!res.ok) throw new Error(String(res.status))
        return res.json() as Promise<{ events: EventSummary[] }>
      })
      .then(({ events }) => {
        // A refetch that lands after a newer one must not overwrite it.
        if (!current) return
        setDays(groupEventsByDay(events, TIME_ZONE))
        setStatus(events.length > 0 ? '' : 'No upcoming events.')
      })
      .catch(() => {
        if (current) setStatus('Could not load the schedule.')
      })

    return () => {
      current = false
    }
  }, [refreshKey])

  return (
    <section className="agenda" aria-labelledby="agenda-heading">
      <h2 id="agenda-heading">Upcoming events</h2>

      <div aria-live="polite">
        {status !== '' && <p className="agenda__status">{status}</p>}

        {/* A list of days, each a list of events: the nesting the eye already
            sees, said out loud for a screen reader too. */}
        <ol className="agenda__days">
          {days.map((day) => (
            <li className="agenda__day" key={day.date}>
              <h3 className="agenda__date">
                {DAY_HEADING.format(new Date(`${day.date}T00:00:00Z`))}
              </h3>

              <ol className="agenda__events">
                {day.events.map((event) => (
                  <li className="agenda__event" key={event.id}>
                    <p className="agenda__time">
                      <time dateTime={event.startsAt}>
                        {CLOCK.format(new Date(event.startsAt))}
                      </time>
                      {' – '}
                      <time dateTime={event.endsAt}>
                        {CLOCK.format(new Date(event.endsAt))}
                      </time>
                    </p>

                    <p className="agenda__name">{event.name}</p>

                    <p className="agenda__meta">
                      {event.game.name} · {event.eventTypeLabel} · {event.location}
                    </p>

                    {/* "Full" is a word, not a colour: the seat count alone
                        already says it, and both survive a monochrome screen. */}
                    <p className="agenda__seats">
                      {event.registeredCount} / {event.capacity} seats
                      {event.isFull && <strong className="agenda__full"> · Full</strong>}
                    </p>
                  </li>
                ))}
              </ol>
            </li>
          ))}
        </ol>
      </div>
    </section>
  )
}

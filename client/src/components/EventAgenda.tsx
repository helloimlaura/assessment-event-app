import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'

import { groupEventsByDay } from '../../../shared/calendar'
import type { CalendarDay } from '../../../shared/calendar'
import type { EventSummary } from '../../../shared/types'
import { TIME_ZONE, formatClock, formatDayHeading } from '../lib/datetime'
import './EventAgenda.css'

/** Midnight this morning, not this instant: an organizer checking the day's
 *  schedule still wants the draft that fired an hour ago on the list. */
function startOfToday(): string {
  const midnight = new Date()
  midnight.setHours(0, 0, 0, 0)
  return midnight.toISOString()
}

export function EventAgenda() {
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
    // No dependencies: the agenda is its own route, so navigating to it
    // mounts a fresh copy and this refetches. Nothing has to tell it that a
    // new event was created elsewhere.
  }, [])

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
                {formatDayHeading(day.date)}
              </h3>

              <ol className="agenda__events">
                {day.events.map((event) => (
                  <li className="agenda__event" key={event.id}>
                    <p className="agenda__time">
                      <time dateTime={event.startsAt}>{formatClock(event.startsAt)}</time>
                      {' – '}
                      <time dateTime={event.endsAt}>{formatClock(event.endsAt)}</time>
                    </p>

                    {/* The only anchor, stretched over the whole card by CSS: the
                        card is the click target, the name stays what a screen
                        reader announces. */}
                    <p className="agenda__name">
                      <Link className="agenda__link" to={`/events/${event.id}`}>
                        {event.name}
                      </Link>
                    </p>

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

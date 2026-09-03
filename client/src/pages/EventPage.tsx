import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'

import type { EventDetail } from '../../../shared/types'
import { RegistrationQr } from '../components/RegistrationQr'
import { formatClock, formatEventDate } from '../lib/datetime'
import './EventPage.css'

/** One value rather than a boolean pair, which would allow "loading and
 *  errored at once" — not a state this page has. */
type Load =
  | { kind: 'loading' }
  | { kind: 'missing' }
  | { kind: 'failed' }
  | { kind: 'loaded'; event: EventDetail }

/** The event an organizer runs the shop from: when and where it fires, seats
 *  taken, the invite to hand out, the QR players scan, and who has registered.
 *
 *  Owns its own fetch, like the other routes, so navigating here mounts a fresh
 *  copy and the seat count is current. */
export function EventPage() {
  const { id } = useParams<{ id: string }>()

  /** Keyed on the id so React discards the view when it changes, rather than
   *  the view resetting its own state and rendering the previous event's roster
   *  for a frame first. */
  return <EventView key={id} id={id ?? ''} />
}

function EventView({ id }: { id: string }) {
  const [load, setLoad] = useState<Load>({ kind: 'loading' })

  useEffect(() => {
    let current = true

    fetch(`/api/events/${encodeURIComponent(id)}`)
      .then(async (res) => {
        // A mistyped id and a server that fell over get different words: one
        // message for both would send an organizer hunting a bug that is a typo.
        if (res.status === 404) return { kind: 'missing' } as const
        if (!res.ok) throw new Error(String(res.status))

        const { event } = (await res.json()) as { event: EventDetail }
        return { kind: 'loaded', event } as const
      })
      .then((next) => {
        // A refetch that lands after a newer one must not overwrite it.
        if (current) setLoad(next)
      })
      .catch(() => {
        if (current) setLoad({ kind: 'failed' })
      })

    return () => {
      current = false
    }
  }, [id])

  if (load.kind === 'loading') return <p aria-live="polite">Loading the event…</p>
  if (load.kind === 'missing') return <p aria-live="polite">That event does not exist.</p>
  if (load.kind === 'failed') return <p aria-live="polite">Could not load the event.</p>

  const { event } = load
  const seatsLeft = event.capacity - event.registeredCount

  return (
    <article className="event" aria-labelledby="event-heading">
      <header className="event__header">
        <h2 className="event__name" id="event-heading">
          {event.name}
        </h2>
        <p className="event__game">
          {event.game.name} · {event.eventTypeLabel}
        </p>
      </header>

      <dl className="event__facts">
        <dt>When</dt>
        <dd>
          <time dateTime={event.startsAt}>
            {formatEventDate(event.startsAt)}, {formatClock(event.startsAt)}
          </time>
          {' – '}
          <time dateTime={event.endsAt}>{formatClock(event.endsAt)}</time>
        </dd>

        <dt>Where</dt>
        <dd>{event.location}</dd>

        <dt>Seats</dt>
        <dd>
          {event.registeredCount} / {event.capacity}
          {event.isFull ? (
            <strong className="event__full"> · Full</strong>
          ) : (
            ` · ${seatsLeft} left`
          )}
        </dd>

        <dt>Minimum to fire</dt>
        <dd>
          {event.minPlayers} players
          {event.meetsMinimum
            ? ' · met'
            : ` · needs ${event.minPlayers - event.registeredCount} more`}
        </dd>
      </dl>

      {/* The server sets the filename and content type, so the browser's own
          download handling is the whole feature. */}
      <a className="event__ics" href={`/api/events/${event.id}/calendar.ics`} download>
        Add to calendar (.ics)
      </a>

      <RegistrationQr registrationUrl={event.registrationUrl} />

      <section className="event__roster" aria-labelledby="roster-heading">
        <h3 id="roster-heading">Registered ({event.registrations.length})</h3>

        {event.registrations.length === 0 ? (
          <p>No players have registered yet.</p>
        ) : (
          <ol className="event__players">
            {event.registrations.map((registration) => (
              /* Names are unique per event — the schema enforces it on
                 `player_key` — so the name is a stable key. */
              <li className="event__player" key={registration.playerName}>
                <span className="event__player-name">{registration.playerName}</span>
                <time className="event__player-time" dateTime={registration.registeredAt}>
                  {formatClock(registration.registeredAt)}
                </time>
              </li>
            ))}
          </ol>
        )}
      </section>
    </article>
  )
}

import { useId, useState } from 'react'
import type { FormEvent } from 'react'
import { Link } from 'react-router-dom'

import type {
  ApiError,
  CreateEventRequest,
  EventSummary,
  EventTypeOption,
  GameTemplate,
} from '../../../shared/types'
import './CreateEventForm.css'

export interface CreateEventFormProps {
  games: GameTemplate[]
  onCreated?: (event: EventSummary) => void
}

/** The venues this organizer runs events at. One for now — the same address
 *  the demo seed uses, so seeded and newly created events agree — but a list
 *  rather than a literal, because a second store is a data change here and
 *  nothing else: the server validates location as free text, so it needs no
 *  matching allow-list to stay in step. */
const VENUES = ['Card Kingdom, 5105 Leary Ave NW, Seattle, WA']

/** `<input type="datetime-local">` yields a wall-clock string with no offset.
 *  Stamping the browser's own offset onto it is what lets the server normalize
 *  to UTC; sending it bare would leave the server guessing which zone the
 *  organizer meant. */
function toIsoWithLocalOffset(localValue: string): string {
  const parsed = new Date(localValue)
  return Number.isNaN(parsed.getTime()) ? localValue : parsed.toISOString()
}

export function CreateEventForm({ games, onCreated }: CreateEventFormProps) {
  const ids = {
    name: useId(),
    gameId: useId(),
    eventType: useId(),
    startsAt: useId(),
    location: useId(),
    capacity: useId(),
  }

  const [gameId, setGameId] = useState(games[0]?.id ?? '')
  const [eventType, setEventType] = useState<string>(
    games[0]?.eventTypes[0]?.eventType ?? '',
  )
  const [name, setName] = useState('')
  const [startsAt, setStartsAt] = useState('')
  const [location, setLocation] = useState(VENUES[0])
  /** Empty means "let the template decide", which is expressed by leaving
   *  capacity out of the request rather than by guessing the default here. */
  const [capacity, setCapacity] = useState('')

  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [formError, setFormError] = useState('')
  const [created, setCreated] = useState<EventSummary | undefined>()
  const [submitting, setSubmitting] = useState(false)

  const game = games.find((g) => g.id === gameId)
  const option: EventTypeOption | undefined = game?.eventTypes.find(
    (o) => o.eventType === eventType,
  )

  /** Changing the game can strand an event type the new game does not run, so
   *  the selection falls back to that game's first option. */
  function chooseGame(nextGameId: string): void {
    setGameId(nextGameId)
    const next = games.find((g) => g.id === nextGameId)
    setEventType(next?.eventTypes[0]?.eventType ?? '')
    setCapacity('')
  }

  async function submit(e: FormEvent): Promise<void> {
    e.preventDefault()
    setSubmitting(true)
    setFieldErrors({})
    setFormError('')
    setCreated(undefined)

    const body: CreateEventRequest = {
      name,
      gameId,
      eventType,
      startsAt: toIsoWithLocalOffset(startsAt),
      location,
      ...(capacity === '' ? {} : { capacity: Number(capacity) }),
    }

    try {
      const res = await fetch('/api/events', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      })

      if (res.status === 201) {
        const { event } = (await res.json()) as { event: EventSummary }
        setCreated(event)
        setName('')
        setStartsAt('')
        setCapacity('')
        // Location is deliberately not reset: an organizer scheduling a run of
        // events is at the same venue every time.
        onCreated?.(event)
        return
      }

      // The server is the authority on what is valid. Whatever it objected to
      // is what the organizer is shown, field by field — the form deliberately
      // does not pre-judge with `required`, so the two can never disagree.
      const { error } = (await res.json()) as ApiError
      setFieldErrors(error.fields ?? {})
      setFormError(error.message)
    } catch {
      setFormError('Could not reach the server.')
    } finally {
      setSubmitting(false)
    }
  }

  const errorId = (field: keyof typeof ids) =>
    fieldErrors[field] === undefined ? undefined : `${ids[field]}-error`

  const fieldError = (field: keyof typeof ids) =>
    fieldErrors[field] === undefined ? null : (
      <p className="create-event__error" id={`${ids[field]}-error`}>
        {fieldErrors[field]}
      </p>
    )

  return (
    <section className="create-event">
      <h2>Create an event</h2>

      <form className="create-event__form" onSubmit={submit} noValidate>
        <div className="create-event__field">
          <label htmlFor={ids.name}>Event name</label>
          <input
            id={ids.name}
            value={name}
            onChange={(e) => setName(e.target.value)}
            // `aria-required`, not `required`: the server is the authority on
            // what is valid, and a browser that refuses the submit first would
            // let the two disagree. This states the fact without taking the
            // check away — the same reason the form carries `noValidate`.
            aria-required="true"
            aria-invalid={fieldErrors.name !== undefined}
            aria-describedby={errorId('name')}
          />
          {fieldError('name')}
        </div>

        <div className="create-event__field">
          <label htmlFor={ids.gameId}>Game</label>
          <select
            id={ids.gameId}
            value={gameId}
            onChange={(e) => chooseGame(e.target.value)}
            aria-invalid={fieldErrors.gameId !== undefined}
            aria-describedby={errorId('gameId')}
          >
            {games.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
          {fieldError('gameId')}
        </div>

        <div className="create-event__field">
          <label htmlFor={ids.eventType}>Event type</label>
          <select
            id={ids.eventType}
            value={eventType}
            onChange={(e) => {
              setEventType(e.target.value)
              setCapacity('')
            }}
            aria-invalid={fieldErrors.eventType !== undefined}
            aria-describedby={errorId('eventType')}
          >
            {(game?.eventTypes ?? []).map((o) => (
              <option key={o.eventType} value={o.eventType}>
                {o.label}
              </option>
            ))}
          </select>
          {option !== undefined && (
            <p className="create-event__hint">
              {option.durationMin} min · seats {option.minPlayers}–{option.maxCapacity} ·
              defaults to {option.defaultCapacity}
            </p>
          )}
          {fieldError('eventType')}
        </div>

        <div className="create-event__field">
          <label htmlFor={ids.startsAt}>Starts at</label>
          <input
            id={ids.startsAt}
            type="datetime-local"
            value={startsAt}
            onChange={(e) => setStartsAt(e.target.value)}
            aria-required="true"
            aria-invalid={fieldErrors.startsAt !== undefined}
            aria-describedby={errorId('startsAt')}
          />
          {fieldError('startsAt')}
        </div>

        <div className="create-event__field">
          <label htmlFor={ids.location}>Location</label>
          <select
            id={ids.location}
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            aria-invalid={fieldErrors.location !== undefined}
            aria-describedby={errorId('location')}
          >
            {VENUES.map((venue) => (
              <option key={venue} value={venue}>
                {venue}
              </option>
            ))}
          </select>
          {fieldError('location')}
        </div>

        <div className="create-event__field">
          <label htmlFor={ids.capacity}>
            Capacity <span className="create-event__optional">(optional)</span>
          </label>
          <input
            id={ids.capacity}
            type="number"
            inputMode="numeric"
            value={capacity}
            min={option?.minPlayers}
            max={option?.maxCapacity}
            placeholder={option === undefined ? '' : String(option.defaultCapacity)}
            onChange={(e) => setCapacity(e.target.value)}
            aria-invalid={fieldErrors.capacity !== undefined}
            aria-describedby={errorId('capacity')}
          />
          {fieldError('capacity')}
        </div>

        <button className="create-event__submit" type="submit" disabled={submitting}>
          {submitting ? 'Creating…' : 'Create event'}
        </button>
      </form>

      {/* One live region, so a screen reader announces whichever outcome lands. */}
      <div aria-live="polite">
        {formError !== '' && <p className="create-event__error">{formError}</p>}

        {created !== undefined && (
          <dl className="create-event__created">
            <dt>Created</dt>
            <dd>{created.name}</dd>
            <dt>Game</dt>
            <dd>
              {created.game.name} — {created.eventTypeLabel}
            </dd>
            <dt>Runs</dt>
            <dd>
              {new Date(created.startsAt).toLocaleString()} –{' '}
              {new Date(created.endsAt).toLocaleTimeString()}
            </dd>
            <dt>Location</dt>
            <dd>{created.location}</dd>
            <dt>Seats</dt>
            <dd>
              {created.registeredCount} / {created.capacity}
            </dd>
            <dt>Event page</dt>
            <dd>
              <Link className="create-event__created-link" to={`/events/${created.id}`}>
                View event and QR code
              </Link>
            </dd>
          </dl>
        )}
      </div>
    </section>
  )
}

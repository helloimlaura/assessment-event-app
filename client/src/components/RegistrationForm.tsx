import { useEffect, useId, useRef, useState } from 'react'
import type { FormEvent, RefObject } from 'react'
import { Link } from 'react-router-dom'

import type { ApiError, EventDetail, RegisterResponse } from '../../../shared/types'
import { formatClock, formatEventDate } from '../lib/datetime'
import './RegistrationForm.css'

export interface RegistrationFormProps {
  event: EventDetail
}

type FullReason = 'at-load' | 'lost-race'

/** What the server said, and therefore what the player is shown.
 *
 *  The split that matters is terminal versus not. A claimed seat and a full
 *  event are both final — there is nothing left to try, so the form goes away
 *  and a panel takes its place. A duplicate name, a blank name or an
 *  unreachable server all leave something worth another attempt, so the form
 *  stays and the message sits above it. */
type Outcome =
  | { kind: 'idle' }
  | { kind: 'submitting' }
  | { kind: 'registered'; response: RegisterResponse }
  | { kind: 'full'; reason: FullReason }
  | { kind: 'refused'; message: string; fieldError?: string }

/** The page a scanned QR code lands on. One field, because a name is all the
 *  assignment asks a player for.
 *
 *  Nothing here decides whether a seat is available. The seat count below is a
 *  label; the server's answer to the POST is the only thing that says whether
 *  the player is in, which is what makes the "the last seat went while you
 *  were typing" outcome a real state this form has to render rather than an
 *  edge case it can pretend away. */
export function RegistrationForm({ event }: RegistrationFormProps) {
  const nameId = useId()
  const inputRef = useRef<HTMLInputElement>(null)
  const outcomeRef = useRef<HTMLHeadingElement>(null)
  /** Only a submit moves focus. Arriving at an event that was already full
   *  must not steal focus from wherever the browser put it on load. */
  const submitted = useRef(false)
  const [playerName, setPlayerName] = useState('')
  const [outcome, setOutcome] = useState<Outcome>(
    // A full event is the same dead end whether it filled a week ago or during
    // the submit; only the wording differs, so it is the same panel.
    event.isFull ? { kind: 'full', reason: 'at-load' } : { kind: 'idle' },
  )

  /** Disabling the submit button drops focus to the body, and a terminal
   *  outcome unmounts the form from under it, so focus has to be put back
   *  deliberately: on the heading of a result there is nothing left to do
   *  about, and on the input of one worth another try. `aria-live` announces
   *  the outcome; this is what stops a keyboard user losing their place. */
  useEffect(() => {
    if (!submitted.current) return

    if (outcome.kind === 'registered' || outcome.kind === 'full') outcomeRef.current?.focus()
    else if (outcome.kind === 'refused') inputRef.current?.focus()
  }, [outcome])

  async function submit(e: FormEvent): Promise<void> {
    e.preventDefault()
    submitted.current = true
    setOutcome({ kind: 'submitting' })

    try {
      const res = await fetch(`/api/events/${encodeURIComponent(event.id)}/registrations`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ playerName }),
      })

      if (res.status === 201) {
        setOutcome({ kind: 'registered', response: (await res.json()) as RegisterResponse })
        return
      }

      const { error } = (await res.json()) as ApiError
      if (error.code === 'EVENT_FULL') {
        setOutcome({ kind: 'full', reason: 'lost-race' })
        return
      }

      setOutcome({ kind: 'refused', message: error.message, fieldError: error.fields?.playerName })
    } catch {
      setOutcome({ kind: 'refused', message: 'Could not reach the server. Try again.' })
    }
  }

  const terminal = outcome.kind === 'registered' || outcome.kind === 'full'
  const seatsLeft = event.capacity - event.registeredCount

  return (
    <section className="register" aria-labelledby="register-heading">
      <header className="register__header">
        <h2 className="register__heading" id="register-heading">
          Register — {event.name}
        </h2>
        <p className="register__when">
          <time dateTime={event.startsAt}>
            {formatEventDate(event.startsAt)}, {formatClock(event.startsAt)}
          </time>
          {' · '}
          {event.location}
        </p>
        {/* The count as it was at load. Nothing polls, so this can be stale
            by the time the player submits — which is exactly what the
            lost-race panel exists to explain. */}
        <p className="register__seats">
          {event.registeredCount} / {event.capacity} seats taken
          {event.isFull ? '' : ` · ${seatsLeft} left`}
        </p>
      </header>

      {/* Present from the first render, and empty until an outcome lands, so
          that whichever panel replaces the form is announced as a change to a
          live region rather than as a region that appeared already spoken. */}
      <div aria-live="polite">
        {outcome.kind === 'registered' && (
          <Registered event={event} headingRef={outcomeRef} response={outcome.response} />
        )}
        {outcome.kind === 'full' && (
          <Full event={event} headingRef={outcomeRef} reason={outcome.reason} />
        )}
        {outcome.kind === 'refused' && <p className="register__error">{outcome.message}</p>}
      </div>

      {!terminal && (
        <form className="register__form" onSubmit={submit} noValidate>
          <div className="register__field">
            <label htmlFor={nameId}>Your name</label>
            <input
              id={nameId}
              ref={inputRef}
              value={playerName}
              autoComplete="name"
              // `aria-required`, not `required`: the server is the only judge
              // of a valid name, so the browser must not refuse the submit
              // first and leave the two disagreeing. This states the fact
              // without taking over the check.
              aria-required="true"
              onChange={(e) => setPlayerName(e.target.value)}
              aria-invalid={outcome.kind === 'refused' && outcome.fieldError !== undefined}
              aria-describedby={
                outcome.kind === 'refused' && outcome.fieldError !== undefined
                  ? `${nameId}-error`
                  : undefined
              }
            />
            {outcome.kind === 'refused' && outcome.fieldError !== undefined && (
              <p className="register__error" id={`${nameId}-error`}>
                {outcome.fieldError}
              </p>
            )}
          </div>

          {/* Disabled in flight so a double-click cannot fire two requests.
              The server's uniqueness rule is what covers two devices. */}
          <button
            className="register__submit"
            type="submit"
            disabled={outcome.kind === 'submitting'}
          >
            {outcome.kind === 'submitting' ? 'Taking your seat…' : 'Register'}
          </button>
        </form>
      )}
    </section>
  )
}

interface PanelProps {
  event: EventDetail
  /** Focused when the panel replaces the form, so the reader lands on the
   *  answer rather than at the top of the document. */
  headingRef: RefObject<HTMLHeadingElement | null>
}

function Registered({ event, headingRef, response }: PanelProps & { response: RegisterResponse }) {
  return (
    <div className="register__outcome register__outcome--in">
      <h3 className="register__outcome-heading" ref={headingRef} tabIndex={-1}>
        You’re in, {response.registration.playerName}.
      </h3>
      <p className="register__outcome-seat">
        Seat {response.event.registeredCount} of {response.event.capacity}.
      </p>
      <Elsewhere event={event} />
    </div>
  )
}

/** Full at page load and full because someone else got there first are the same
 *  dead end, so they share a panel — but not the same sentence. The wording is
 *  the page's rather than the server's because only the page knows a submit
 *  just happened; a player who watched the seat line say "1 left" and then read
 *  the generic message would think the form was broken. */
const FULL_DETAIL: Record<FullReason, string> = {
  'at-load': 'Every seat was taken before you opened this page.',
  'lost-race': 'That was the last seat, and it went while you were filling this in.',
}

function Full({ event, headingRef, reason }: PanelProps & { reason: FullReason }) {
  return (
    <div className="register__outcome register__outcome--full">
      <h3 className="register__outcome-heading" ref={headingRef} tabIndex={-1}>
        Sorry — this event is full.
      </h3>
      <p className="register__outcome-detail">{FULL_DETAIL[reason]}</p>
      <p className="register__outcome-seat">
        {event.capacity} / {event.capacity} seats taken.
      </p>
      <Elsewhere event={event} />
    </div>
  )
}

/** Every terminal outcome ends somewhere other than this form. */
function Elsewhere({ event }: { event: EventDetail }) {
  return (
    <ul className="register__links">
      <li>
        <Link to={`/events/${event.id}`}>View the event</Link>
      </li>
      <li>
        <Link to="/calendar">Back to the schedule</Link>
      </li>
    </ul>
  )
}

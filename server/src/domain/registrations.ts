/** Requirement 5: claiming a seat, and the last seat exactly once.
 *
 *  The load-bearing rule in this file is that nothing reads the seat count in
 *  order to decide whether a seat is free. The check is the WHERE clause of the
 *  statement that performs the increment, so there is no window between finding
 *  a seat and taking it for a second request to slip into.
 */
import { randomUUID } from 'node:crypto'

import type { ErrorCode, RegisterRequest, RegisterResponse } from '../../../shared/types'
import type { Db } from '../db'

/** What `UNIQUE (event_id, player_key)` compares. Computed in one place so
 *  that "Nissa Revane", "nissa revane" and " Nissa Revane " are one player:
 *  the column exists because SQLite's UNIQUE is over stored bytes, and the
 *  stored `player_name` has to keep the capitalization the player typed. */
export function playerKeyFor(playerName: string): string {
  return playerName.trim().toLowerCase()
}

export interface RegistrationInput {
  playerName: string
  playerKey: string
}

export type RegistrationValidation =
  | { ok: true; value: RegistrationInput }
  | { ok: false; code: ErrorCode; message: string; fields?: Record<string, string> }

/** A name is the whole form, so there is one field to check. It is still
 *  reported as a field rather than a bare message, because the client renders
 *  it under the input it belongs to. */
export function validateRegistration(body: unknown): RegistrationValidation {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return { ok: false, code: 'MALFORMED_BODY', message: 'Request body was not an object.' }
  }

  const { playerName } = body as Partial<RegisterRequest>
  if (typeof playerName !== 'string' || playerName.trim() === '') {
    return {
      ok: false,
      code: 'VALIDATION_FAILED',
      message: 'Some fields need fixing.',
      fields: { playerName: 'Your name is required.' },
    }
  }

  const name = playerName.trim()
  return { ok: true, value: { playerName: name, playerKey: playerKeyFor(name) } }
}

/** The codes a registration can be refused with. Narrower than `ErrorCode`, so
 *  the route cannot be handed a status this path never produces. */
export type RefusalCode = 'NOT_FOUND' | 'EVENT_FULL' | 'DUPLICATE_REGISTRATION'

export type RegisterResult =
  | { ok: true; value: RegisterResponse }
  | { ok: false; code: RefusalCode; message: string }

/** Refusing by throwing is not incidental: better-sqlite3 commits a transaction
 *  when its function returns and rolls back when it throws. Every refusal
 *  therefore throws, which is what undoes the increment when the insert turns
 *  out to be a duplicate, and what keeps the two refusals that write nothing
 *  from committing an empty transaction. Only a claimed seat returns. */
class Refusal extends Error {
  constructor(
    readonly code: RefusalCode,
    message: string,
  ) {
    super(message)
    this.name = 'Refusal'
  }
}

function isUniqueViolation(err: unknown): boolean {
  return (err as { code?: unknown } | null)?.code === 'SQLITE_CONSTRAINT_UNIQUE'
}

/** The row the claim reports back. RETURNING makes the increment and the count
 *  the player is shown one statement, so the number in the response is the
 *  number that was written, not a re-read that a later request could have
 *  moved on. */
interface ClaimedRow {
  id: string
  name: string
  registeredCount: number
  capacity: number
}

export interface RegistrationStore {
  register: (eventId: string, input: RegistrationInput) => RegisterResult
}

export function createRegistrationStore(db: Db): RegistrationStore {
  /** The whole of capacity enforcement. `confirmed_count < capacity` is
   *  evaluated by the same statement that increments it, so two requests
   *  racing for the final seat cannot both match: SQLite serializes writers,
   *  and the loser sees the winner's committed count. Zero rows means the seat
   *  was not available — or the event was not there at all. */
  const claimSeat = db.prepare(
    `UPDATE events
        SET confirmed_count = confirmed_count + 1
      WHERE id = @eventId
        AND confirmed_count < capacity
     RETURNING id, name, confirmed_count AS registeredCount, capacity`,
  )
  const insertRegistration = db.prepare(
    `INSERT INTO registrations (id, event_id, player_name, player_key, created_at)
     VALUES (@id, @eventId, @playerName, @playerKey, @createdAt)`,
  )
  const eventExists = db.prepare('SELECT 1 FROM events WHERE id = ?')

  const claim = db.transaction(
    (eventId: string, input: RegistrationInput): RegisterResponse => {
      const claimed = claimSeat.get({ eventId }) as ClaimedRow | undefined
      if (claimed === undefined) {
        // The only SELECT on the path, and it runs after the write has already
        // failed: a zero-row UPDATE is ambiguous between a full event and an
        // event that does not exist, which are different answers to the
        // player. Nothing has been written and nothing will be, so reading
        // here cannot race anything.
        throw eventExists.get(eventId) === undefined
          ? new Refusal('NOT_FOUND', 'No event with that id.')
          : new Refusal('EVENT_FULL', 'This event is full — every seat has been taken.')
      }

      const registration = {
        id: randomUUID(),
        playerName: input.playerName,
        registeredAt: new Date().toISOString(),
      }

      try {
        insertRegistration.run({
          id: registration.id,
          eventId,
          playerName: registration.playerName,
          playerKey: input.playerKey,
          createdAt: registration.registeredAt,
        })
      } catch (err) {
        // The seat was already claimed above; throwing is what gives it back.
        if (isUniqueViolation(err)) {
          throw new Refusal(
            'DUPLICATE_REGISTRATION',
            `${input.playerName} is already registered for this event.`,
          )
        }
        throw err
      }

      return {
        registration,
        event: {
          id: claimed.id,
          name: claimed.name,
          registeredCount: claimed.registeredCount,
          capacity: claimed.capacity,
        },
      }
    },
  )

  return {
    register: (eventId, input) => {
      try {
        // IMMEDIATE takes the write lock at BEGIN. A deferred transaction
        // starts as a reader and has to upgrade, which under contention is
        // where SQLITE_BUSY comes from; taking it up front serializes racing
        // registrations at the lock instead of at the row.
        return { ok: true, value: claim.immediate(eventId, input) }
      } catch (err) {
        if (err instanceof Refusal) {
          return { ok: false, code: err.code, message: err.message }
        }
        throw err
      }
    },
  }
}

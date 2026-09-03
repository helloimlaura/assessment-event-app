/** Requirement 1: creating an event, and reading one back.
 *
 *  Validation and row mapping live here rather than in the route so the rules
 *  can be read in one place. The route's job is to translate the result of
 *  `validateCreateEvent` into a status code and nothing else.
 */
import { randomUUID } from 'node:crypto'

import type {
  CreateEventRequest,
  ErrorCode,
  EventDetail,
  EventSummary,
  EventType,
} from '../../../shared/types'
import type { Db } from '../db'
import type { TemplateRegistry } from './gameTemplates'

/** The assignment's ceiling. A template may cap an event type lower — mtg
 *  DRAFT is a single booster pod, so its maximum is 8 — but nothing may go
 *  above this, and `events.capacity` carries the same CHECK. */
export const MAX_PLAYERS = 30

/** What the organizer asked for, after the template has had the final say on
 *  duration and minimum players. This, not the request body, is what is
 *  stored: a client can put any JSON on the wire, and `durationMin` and
 *  `minPlayers` are never read from it. */
export interface NormalizedEvent {
  name: string
  gameId: string
  eventType: EventType
  startsAt: string          // UTC ISO
  location: string
  capacity: number
  durationMin: number
  minPlayers: number
}

export type ValidationResult =
  | { ok: true; value: NormalizedEvent }
  | { ok: false; code: ErrorCode; message: string; fields?: Record<string, string> }

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** A required free-text field: present, a string, and not just whitespace. */
function requireText(
  fields: Record<string, string>,
  key: string,
  value: unknown,
  label: string,
): string | undefined {
  if (typeof value !== 'string' || value.trim() === '') {
    fields[key] = `${label} is required.`
    return undefined
  }
  return value.trim()
}

/** Check every field, then report. Returning on the first problem would make
 *  an organizer fix a four-field form one submit at a time. */
export function validateCreateEvent(
  body: unknown,
  templates: TemplateRegistry,
): ValidationResult {
  if (!isPlainObject(body)) {
    return { ok: false, code: 'MALFORMED_BODY', message: 'Request body was not an object.' }
  }

  const raw = body as Partial<CreateEventRequest>
  const fields: Record<string, string> = {}

  const name = requireText(fields, 'name', raw.name, 'Event name')
  const location = requireText(fields, 'location', raw.location, 'Location')

  let startsAt: string | undefined
  if (typeof raw.startsAt !== 'string' || raw.startsAt.trim() === '') {
    fields.startsAt = 'Start date and time are required.'
  } else if (Number.isNaN(Date.parse(raw.startsAt))) {
    fields.startsAt = 'Start date and time could not be read as a date.'
  } else {
    // Whatever offset the organizer's browser sent, storage is UTC.
    startsAt = new Date(Date.parse(raw.startsAt)).toISOString()
  }

  const gameId = requireText(fields, 'gameId', raw.gameId, 'Game')
  const game = gameId === undefined ? undefined : templates.get(gameId)
  if (gameId !== undefined && game === undefined) {
    // VALIDATION_FAILED, not NOT_FOUND: nothing that exists was requested and
    // missed. A well-formed body named a game that does not exist, which is a
    // bad field in the payload and is reported as one.
    fields.gameId = `No game with id "${gameId}".`
  }

  const eventType = requireText(fields, 'eventType', raw.eventType, 'Event type')

  // Capacity's shape can be judged without a template; its range cannot.
  const capacityGiven = raw.capacity !== undefined && raw.capacity !== null
  if (capacityGiven) {
    const capacity = raw.capacity
    if (typeof capacity !== 'number' || !Number.isInteger(capacity)) {
      fields.capacity = 'Capacity must be a whole number of players.'
    } else if (capacity < 1 || capacity > MAX_PLAYERS) {
      fields.capacity = `Capacity must be between 1 and ${MAX_PLAYERS} players.`
    }
  }

  const option =
    game !== undefined && eventType !== undefined
      ? templates.eventTypeOption(game.id, eventType as EventType)
      : undefined

  // A game that does not run this event type is its own error code, but only
  // when nothing else is wrong — otherwise the organizer would be told about
  // an unsupported event type while a blank name goes unmentioned.
  if (game !== undefined && eventType !== undefined && option === undefined) {
    if (Object.keys(fields).length > 0) {
      return { ok: false, code: 'VALIDATION_FAILED', message: 'Some fields need fixing.', fields }
    }
    return {
      ok: false,
      code: 'UNSUPPORTED_EVENT_TYPE',
      message: `${game.name} does not run ${eventType} events.`,
    }
  }

  // The template owns the range: an event that cannot fire, or that seats more
  // players than the event type physically allows, is not a valid event.
  let capacity: number | undefined
  if (option !== undefined) {
    capacity = capacityGiven ? (raw.capacity as number) : option.defaultCapacity
    if (fields.capacity === undefined) {
      if (capacity < option.minPlayers) {
        fields.capacity =
          `${option.label} needs at least ${option.minPlayers} players to fire.`
      } else if (capacity > option.maxCapacity) {
        fields.capacity =
          `${option.label} seats at most ${option.maxCapacity} players.`
      }
    }
  }

  if (Object.keys(fields).length > 0) {
    return { ok: false, code: 'VALIDATION_FAILED', message: 'Some fields need fixing.', fields }
  }

  return {
    ok: true,
    value: {
      name: name!,
      gameId: game!.id,
      eventType: eventType as EventType,
      startsAt: startsAt!,
      location: location!,
      capacity: capacity!,
      // From the template, never from the body.
      durationMin: option!.durationMin,
      minPlayers: option!.minPlayers,
    },
  }
}

/** A calendar window. Both ends are optional: no window at all means the whole
 *  schedule, which is what the agenda asks for when it wants everything from
 *  now on and has no far end in mind. */
export interface EventWindow {
  from?: string   // UTC ISO, inclusive
  to?: string     // UTC ISO, exclusive
}

export type WindowResult =
  | { ok: true; value: EventWindow }
  | { ok: false; code: ErrorCode; message: string; fields?: Record<string, string> }

/** Both bounds are normalized to UTC ISO for the same reason `startsAt` is on
 *  the way in: `starts_at` is compared as text in SQL, so "…T12:00:00Z" and
 *  the stored "…T12:00:00.000Z" have to be spelled the same way before `>=`
 *  can mean what it says. */
function readBound(
  fields: Record<string, string>,
  key: 'from' | 'to',
  value: unknown,
  label: string,
): string | undefined {
  if (value === undefined) return undefined

  if (typeof value !== 'string' || value.trim() === '') {
    fields[key] = `${label} must be a date and time.`
    return undefined
  }
  if (Number.isNaN(Date.parse(value))) {
    fields[key] = `${label} could not be read as a date.`
    return undefined
  }
  return new Date(Date.parse(value)).toISOString()
}

/** A window the server cannot read is refused rather than quietly dropped:
 *  silently ignoring `?from=whenever` would answer a question the organizer
 *  did not ask, with a list covering dates they never requested. 422 for the
 *  same reason an unparseable `startsAt` in a body is 422 — the query string
 *  parsed fine, the value in it is what the domain refuses. */
export function validateEventWindow(query: Record<string, unknown>): WindowResult {
  const fields: Record<string, string> = {}

  const from = readBound(fields, 'from', query.from, 'Window start')
  const to = readBound(fields, 'to', query.to, 'Window end')

  if (Object.keys(fields).length > 0) {
    return { ok: false, code: 'VALIDATION_FAILED', message: 'Some fields need fixing.', fields }
  }

  return { ok: true, value: { ...(from ? { from } : {}), ...(to ? { to } : {}) } }
}

/** One row of the events table already joined to the game name and the event
 *  type's label, which are the only two display strings an event does not
 *  carry itself. */
interface EventRow {
  id: string
  name: string
  gameId: string
  gameName: string
  eventType: EventType
  eventTypeLabel: string
  startsAt: string
  durationMin: number
  capacity: number
  minPlayers: number
  location: string
  registeredCount: number
}

interface RegistrationRow {
  playerName: string
  registeredAt: string
}

const SELECT_EVENT = `
  SELECT e.id,
         e.name,
         e.game_id         AS gameId,
         g.name            AS gameName,
         e.event_type      AS eventType,
         c.label           AS eventTypeLabel,
         e.starts_at       AS startsAt,
         e.duration_min    AS durationMin,
         e.capacity,
         e.min_players     AS minPlayers,
         e.location,
         e.confirmed_count AS registeredCount
  FROM events e
  JOIN games g ON g.id = e.game_id
  JOIN event_type_configs c
    ON c.game_id = e.game_id AND c.event_type = e.event_type`

/** `endsAt` is derived rather than stored: two columns that must agree are two
 *  columns that can disagree. Duration is the fact; the end time is a view of
 *  it. */
function endsAt(startsAt: string, durationMin: number): string {
  return new Date(Date.parse(startsAt) + durationMin * 60_000).toISOString()
}

function toSummary(row: EventRow): EventSummary {
  return {
    id: row.id,
    name: row.name,
    game: { id: row.gameId, name: row.gameName },
    eventType: row.eventType,
    eventTypeLabel: row.eventTypeLabel,
    startsAt: row.startsAt,
    endsAt: endsAt(row.startsAt, row.durationMin),
    location: row.location,
    capacity: row.capacity,
    registeredCount: row.registeredCount,
    isFull: row.registeredCount >= row.capacity,
  }
}

/** Reads and writes for events. Statements are prepared once per database
 *  handle; the route holds one of these instead of any SQL of its own. */
export interface EventStore {
  create: (event: NormalizedEvent) => EventSummary
  list: (window: EventWindow) => EventSummary[]
  findDetail: (id: string) => EventDetail | undefined
}

export function createEventStore(db: Db, publicBaseUrl: string): EventStore {
  // A trailing slash here would produce "…//events/x" in every QR code.
  const baseUrl = publicBaseUrl.replace(/\/+$/, '')

  const insert = db.prepare(
    `INSERT INTO events
       (id, name, game_id, event_type, starts_at, duration_min, capacity,
        min_players, location, confirmed_count, created_at)
     VALUES
       (@id, @name, @gameId, @eventType, @startsAt, @durationMin, @capacity,
        @minPlayers, @location, 0, @createdAt)`,
  )
  const selectById = db.prepare(`${SELECT_EVENT}\n  WHERE e.id = ?`)
  /** One statement rather than one per shape of window: a NULL bound matches
   *  everything, so an open end costs no extra SQL and no string building. */
  const selectInWindow = db.prepare(
    `${SELECT_EVENT}
  WHERE (@from IS NULL OR e.starts_at >= @from)
    AND (@to   IS NULL OR e.starts_at <  @to)
  ORDER BY e.starts_at, e.rowid`,
  )
  const selectRegistrations = db.prepare(
    `SELECT player_name AS playerName, created_at AS registeredAt
     FROM registrations
     WHERE event_id = ?
     ORDER BY created_at, rowid`,
  )

  const rowById = (id: string): EventRow | undefined =>
    selectById.get(id) as EventRow | undefined

  return {
    create: (event) => {
      const id = randomUUID()
      insert.run({ ...event, id, createdAt: new Date().toISOString() })
      // Read back rather than echo the request: the row that was stored is
      // the one the organizer is shown, joins and defaults included.
      return toSummary(rowById(id)!)
    },

    list: (window) =>
      (selectInWindow.all({
        from: window.from ?? null,
        to: window.to ?? null,
      }) as EventRow[]).map(toSummary),

    findDetail: (id) => {
      const row = rowById(id)
      if (row === undefined) return undefined

      return {
        ...toSummary(row),
        minPlayers: row.minPlayers,
        durationMin: row.durationMin,
        // Absolute, so a scanned QR code works from a device that has never
        // seen this origin.
        registrationUrl: `${baseUrl}/events/${row.id}/register`,
        meetsMinimum: row.registeredCount >= row.minPlayers,
        registrations: selectRegistrations.all(row.id) as RegistrationRow[],
      }
    },
  }
}

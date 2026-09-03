/** Machine identifier for an event type, e.g. "DRAFT". Not a closed union:
 *  the set of valid values is whatever `event_type_configs` contains for a
 *  given game, and is enforced by `validateCreateEvent` and the composite
 *  foreign key on `events`, not by the compiler. */
export type EventType = string

export type ErrorCode =
  | 'MALFORMED_BODY' | 'VALIDATION_FAILED' | 'NOT_FOUND' | 'EVENT_FULL'
  | 'DUPLICATE_REGISTRATION' | 'UNSUPPORTED_EVENT_TYPE'
  | 'INTERNAL'

/** The HTTP status each code answers with, so routes, tests and the README
 *  cannot drift apart. The 400/422 split is the load-bearing one: 400 means
 *  the request could not be understood at all (a body that is not JSON), 422
 *  means it was understood and the domain refused it — a blank name, a
 *  capacity above the template maximum, a Commander pod for a game that does
 *  not run Commander. */
export const ERROR_STATUS: Record<ErrorCode, number> = {
  MALFORMED_BODY: 400,
  VALIDATION_FAILED: 422,
  UNSUPPORTED_EVENT_TYPE: 422,
  NOT_FOUND: 404,
  EVENT_FULL: 409,
  DUPLICATE_REGISTRATION: 409,
  INTERNAL: 500,
}

export interface ApiError {
  error: { code: ErrorCode; message: string; fields?: Record<string, string> }
}

export interface EventTypeOption {
  eventType: EventType
  label: string
  durationMin: number
  defaultCapacity: number
  maxCapacity: number
  minPlayers: number
}

export interface GameTemplate {
  id: string
  name: string
  eventTypes: EventTypeOption[]
}

export interface CreateEventRequest {
  name: string
  gameId: string
  eventType: EventType
  startsAt: string        // ISO 8601, any offset; server normalizes to UTC
  location: string
  capacity?: number
}

export interface EventSummary {
  id: string
  name: string
  game: { id: string; name: string }
  eventType: EventType
  eventTypeLabel: string
  startsAt: string        // UTC ISO
  endsAt: string          // UTC ISO, computed server-side
  location: string
  capacity: number
  registeredCount: number
  isFull: boolean
}

export interface EventDetail extends EventSummary {
  minPlayers: number
  durationMin: number
  registrationUrl: string // absolute; this exact string is what the QR encodes
  meetsMinimum: boolean
  registrations: { playerName: string; registeredAt: string }[]
}

export interface RegisterRequest { playerName: string }

export interface RegisterResponse {
  registration: { id: string; playerName: string; registeredAt: string }
  event: { id: string; name: string; registeredCount: number; capacity: number }
}

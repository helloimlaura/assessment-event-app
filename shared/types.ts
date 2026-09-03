/** The kind of event being run. The assignment calls these "play formats";
 *  this codebase always calls them **event types**, because "format" on its own
 *  means deck-building format (Modern, Core Constructed, Expanded) — a separate,
 *  out-of-scope concept. Which event types a game offers, and the duration,
 *  capacity and minimum-player rules each one implies, come from that game's
 *  template. See EventTypeOption. */
export type EventType =
  | 'DRAFT' | 'SEALED' | 'CONSTRUCTED' | 'COMMANDER' | 'PRERELEASE'

export type ErrorCode =
  | 'VALIDATION_FAILED' | 'NOT_FOUND' | 'EVENT_FULL'
  | 'DUPLICATE_REGISTRATION' | 'UNSUPPORTED_EVENT_TYPE'
  | 'INTERNAL'

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

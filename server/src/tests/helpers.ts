import type { AddressInfo } from 'node:net'
import type { Server } from 'node:http'

import { createApp } from '../app'
import { openDatabase } from '../db'
import type { Db } from '../db'
import type {
  ApiError,
  CreateEventRequest,
  EventDetail,
  EventSummary,
  GameTemplate,
} from '../../../shared/types'

/** Base URL the app is told to advertise. Deliberately not the listen address,
 *  so tests can prove registration URLs are absolute and shareable. */
export const PUBLIC_BASE_URL = 'https://events.example.test'

export interface TestServer {
  url: string
  close: () => Promise<void>
}

interface TestServerOptions {
  /** Apply suite-specific database rows before the app is constructed. */
  prepareDb?: (db: Db) => void
}

export async function startTestServer(
  opts: TestServerOptions = {},
): Promise<TestServer> {
  const db = openDatabase(':memory:')
  opts.prepareDb?.(db)
  const app = createApp({
    db,
    publicBaseUrl: PUBLIC_BASE_URL,
  })

  const server: Server = await new Promise((resolve) => {
    const s = app.listen(0, () => resolve(s))
  })
  const { port } = server.address() as AddressInfo

  return {
    url: `http://127.0.0.1:${port}`,
    close: () =>
      new Promise<void>((resolve, reject) =>
        server.close((err) => {
          db.close()
          err ? reject(err) : resolve()
        }),
      ),
  }
}

export const VALID_EVENT: CreateEventRequest = {
  name: 'Friday Night Magic',
  gameId: 'mtg',
  eventType: 'DRAFT',
  startsAt: '2026-10-16T18:00:00-07:00',
  location: 'Card Kingdom, 5105 Leary Ave NW, Seattle, WA',
  // 8, not 16: mtg/DRAFT is a single booster pod, so its template caps it at
  // 8. At 16 this "valid" fixture is rejected by the very rule
  // eventCreation.test.ts asserts, and every suite built on createEvent()
  // fails for a reason unrelated to what it tests.
  capacity: 8,
}

export async function postEvent(
  srv: TestServer,
  overrides: Partial<CreateEventRequest> = {},
): Promise<Response> {
  return fetch(`${srv.url}/api/events`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ ...VALID_EVENT, ...overrides }),
  })
}

/** Creates an event and returns its summary, failing loudly if creation broke. */
export async function createEvent(
  srv: TestServer,
  overrides: Partial<CreateEventRequest> = {},
): Promise<EventSummary> {
  const res = await postEvent(srv, overrides)
  if (res.status !== 201) {
    throw new Error(`event creation failed (${res.status}): ${await res.text()}`)
  }
  return ((await res.json()) as { event: EventSummary }).event
}

export async function getEventDetail(
  srv: TestServer,
  id: string,
): Promise<EventDetail> {
  const res = await fetch(`${srv.url}/api/events/${id}`)
  if (res.status !== 200) {
    throw new Error(`event fetch failed (${res.status}): ${await res.text()}`)
  }
  return ((await res.json()) as { event: EventDetail }).event
}

export async function register(
  srv: TestServer,
  eventId: string,
  playerName: string,
): Promise<Response> {
  return fetch(`${srv.url}/api/events/${eventId}/registrations`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ playerName }),
  })
}

export async function fetchGames(srv: TestServer): Promise<GameTemplate[]> {
  const res = await fetch(`${srv.url}/api/games`)
  if (res.status !== 200) {
    throw new Error(`games fetch failed (${res.status}): ${await res.text()}`)
  }
  return ((await res.json()) as { games: GameTemplate[] }).games
}

export async function errorBody(res: Response): Promise<ApiError['error']> {
  return ((await res.json()) as ApiError).error
}

export function minutesBetween(startIso: string, endIso: string): number {
  return (Date.parse(endIso) - Date.parse(startIso)) / 60_000
}

import express from 'express'
import type { Express, NextFunction, Request, Response } from 'express'

import { ERROR_STATUS } from '../../shared/types'
import type { ApiError, ErrorCode } from '../../shared/types'
import type { Db } from './db'
import { createEventStore, validateCreateEvent, validateEventWindow } from './domain/events'
import { createTemplateRegistry } from './domain/gameTemplates'
import { buildInvite } from './domain/icsInvite'

export interface AppDeps {
  db: Db
  /** Absolute origin the registration links and QR codes point at. */
  publicBaseUrl: string
}

/** Answer with the status `ERROR_STATUS` assigns the code, so that no route
 *  picks a number of its own and drifts from the documented contract. */
function fail(
  res: Response,
  code: ErrorCode,
  message: string,
  fields?: Record<string, string>,
): void {
  const body: ApiError = { error: { code, message, ...(fields ? { fields } : {}) } }
  res.status(ERROR_STATUS[code]).json(body)
}

export function createApp(deps: AppDeps): Express {
  /** All game membership and rules come from the same database that stores
   *  events. There is no second, code-owned template list to keep in sync. */
  const templates = createTemplateRegistry(deps.db)
  const events = createEventStore(deps.db, deps.publicBaseUrl)

  const app = express()
  app.use(express.json())

  /** Requirement 2 over HTTP: every game, and for each one the event types it
   *  runs plus the duration, capacity and minimum-player rules each implies.
   *  The registry queries `games` and `event_type_configs`, so new rows are
   *  visible without changing this route or restarting the process. */
  app.get('/api/games', (_req, res) => {
    res.json({ games: templates.list() })
  })

  /** Requirement 3: the schedule the calendar renders. An optional
   *  `?from=&to=` window narrows it — inclusive of `from`, exclusive of `to`,
   *  so consecutive windows tile without double-counting an event on the
   *  boundary. Grouping into days is the client's job, using the shared
   *  `groupEventsByDay`: which local day an event falls on depends on the
   *  viewer's time zone, and the server does not know it. */
  app.get('/api/events', (req, res) => {
    const window = validateEventWindow(req.query as Record<string, unknown>)
    if (!window.ok) {
      fail(res, window.code, window.message, window.fields)
      return
    }

    res.json({ events: events.list(window.value) })
  })

  /** Requirement 1: create an event. The template, not the request body,
   *  decides duration and minimum players, and supplies the capacity when the
   *  organizer leaves it blank. */
  app.post('/api/events', (req, res) => {
    const parsed = validateCreateEvent(req.body, templates)
    if (!parsed.ok) {
      fail(res, parsed.code, parsed.message, parsed.fields)
      return
    }

    res.status(201).json({ event: events.create(parsed.value) })
  })

  /** Requirement 1: read one back. This is also the event page the
   *  registration link and QR code point at. */
  app.get('/api/events/:id', (req, res) => {
    const event = events.findDetail(req.params.id)
    if (event === undefined) {
      fail(res, 'NOT_FOUND', 'No event with that id.')
      return
    }

    res.json({ event })
  })

  /** Requirement 4: the same event as an .ics for Google Calendar or Outlook.
   *  The 404 is spelled out rather than left to the catch-all below, so what an
   *  unknown id returns is readable here rather than traced through it. */
  app.get('/api/events/:id/calendar.ics', (req, res) => {
    const event = events.findDetail(req.params.id)
    if (event === undefined) {
      fail(res, 'NOT_FOUND', 'No event with that id.')
      return
    }

    const invite = buildInvite(event, deps.publicBaseUrl)
    if (invite === undefined) {
      fail(res, 'INTERNAL', 'Could not build the calendar invite.')
      return
    }

    res.type('text/calendar; charset=utf-8')
    res.setHeader('Content-Disposition', `attachment; filename="${invite.filename}"`)
    res.send(invite.body)
  })

  // Anything else under /api is a missing endpoint rather than a client-side
  // route, so it answers in the JSON error shape instead of Express's HTML.
  app.use('/api', (_req, res) => {
    fail(res, 'NOT_FOUND', 'No such endpoint.')
  })

  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    // A body `express.json()` could not parse arrives here carrying its own
    // 400; anything else reaching this point is a bug, not a bad request.
    const status = (err as { status?: unknown } | null)?.status
    if (status === 400) {
      fail(res, 'MALFORMED_BODY', 'Request body was not valid JSON.')
      return
    }

    console.error(err)
    fail(res, 'INTERNAL', 'Something went wrong.')
  })

  return app
}

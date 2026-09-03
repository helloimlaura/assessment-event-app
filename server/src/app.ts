import express from 'express'
import type { Express, NextFunction, Request, Response } from 'express'

import { ERROR_STATUS } from '../../shared/types'
import type { ApiError, ErrorCode } from '../../shared/types'
import type { Db } from './db'
import { createTemplateRegistry } from './domain/gameTemplates'

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

/** TODO(green): mount /api/events and registrations. */
export function createApp(deps: AppDeps): Express {
  /** All game membership and rules come from the same database that stores
   *  events. There is no second, code-owned template list to keep in sync. */
  const templates = createTemplateRegistry(deps.db)

  const app = express()
  app.use(express.json())

  /** Requirement 2 over HTTP: every game, and for each one the event types it
   *  runs plus the duration, capacity and minimum-player rules each implies.
   *  The registry queries `games` and `event_type_configs`, so new rows are
   *  visible without changing this route or restarting the process. */
  app.get('/api/games', (_req, res) => {
    res.json({ games: templates.list() })
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

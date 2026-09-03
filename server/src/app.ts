import type { Express } from 'express'

import type { Db } from './db'
import type { TemplateRegistry } from './domain/gameTemplates'

export interface AppDeps {
  db: Db
  /** Absolute origin the registration links and QR codes point at. */
  publicBaseUrl: string
  templates?: TemplateRegistry
}

/** TODO(green): mount /api/games, /api/events and registrations. */
export function createApp(_deps: AppDeps): Express {
  throw new Error('not implemented: createApp')
}

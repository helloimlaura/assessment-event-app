import Database from 'better-sqlite3'
import type BetterSqlite3 from 'better-sqlite3'
import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

import { seedDemoEvents, seedGameTemplates } from './seed'

export type Db = BetterSqlite3.Database

const SCHEMA_PATH = join(__dirname, 'schema.sql')

/** The `server` package directory, found by walking up from this module to the
 *  nearest `package.json`.
 *
 *  A path relative to `__dirname` cannot serve both layouts: `tsc` emits with
 *  `rootDir: '..'`, so this file is `src/db/` under tsx but `dist/server/src/db/`
 *  once built, two different depths from the package root. The old
 *  `../../data/app.db` was correct for the first and silently wrong for the
 *  second — it put the live database inside `dist/`, which meant `npm start`
 *  and `npm run dev` used different files and any clean rebuild deleted the
 *  built one. Anchoring on `package.json` is the same answer from either. */
function packageRoot(): string {
  let dir = __dirname
  while (!existsSync(join(dir, 'package.json'))) {
    const parent = dirname(dir)
    if (parent === dir) {
      throw new Error(`could not locate the server package root above ${__dirname}`)
    }
    dir = parent
  }
  return dir
}

/** Where the application's own database file lives. `DB_PATH` overrides it
 *  for a deployment that keeps state somewhere else. Tests do not go through
 *  this: they call `openDatabase(':memory:')` directly. */
export const DEFAULT_DB_PATH = process.env.DB_PATH ?? join(packageRoot(), 'data', 'app.db')

const IN_MEMORY = ':memory:'

/** Open a database, apply the schema, and make sure the game templates are
 *  present. Templates are seeded on every open because the composite foreign
 *  key from `events` to `event_type_configs` means an empty template table
 *  makes every event insert fail — including in tests, which open `:memory:`.
 *
 *  Demo *events* are deliberately not seeded here, so a test database contains
 *  only the rows its own test created. `getDatabase` adds them for the app.
 */
export function openDatabase(file: string): Db {
  if (file !== IN_MEMORY) {
    mkdirSync(dirname(file), { recursive: true })
  }

  const db = new Database(file)

  // WAL is a no-op for an in-memory database, which has no journal file.
  if (file !== IN_MEMORY) {
    db.pragma('journal_mode = WAL')
  }
  db.pragma('foreign_keys = ON')
  db.exec(readFileSync(SCHEMA_PATH, 'utf8'))
  seedGameTemplates(db)

  return db
}

let appDb: Db | undefined

/** The application's shared handle, opened on first use. Lazy rather than a
 *  module-level `const` so that importing this module — which the tests do, for
 *  `openDatabase` — never touches the filesystem or creates `server/data/`.
 *
 *  Demo events are added only when the events table is empty, so a fresh clone
 *  has something on the agenda after nothing more than `npm run dev`, while a
 *  database that already has events is left alone.
 */
export function getDatabase(): Db {
  if (!appDb) {
    appDb = openDatabase(DEFAULT_DB_PATH)
    const { n } = appDb.prepare('SELECT count(*) AS n FROM events').get() as { n: number }
    if (n === 0) {
      seedDemoEvents(appDb)
    }
  }
  return appDb
}

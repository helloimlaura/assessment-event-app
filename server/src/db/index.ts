import type BetterSqlite3 from 'better-sqlite3'

export type Db = BetterSqlite3.Database

/** TODO(green): open the file, apply the schema, return a ready handle. */
export function openDatabase(_file: string): Db {
  throw new Error('not implemented: openDatabase')
}

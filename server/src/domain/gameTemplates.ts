import type { EventType, EventTypeOption, GameTemplate } from '../../../shared/types'
import type { Db } from '../db'

/** Lookup surface the routes depend on, so games stay data rather than code. */
export interface TemplateRegistry {
  list: () => GameTemplate[]
  get: (gameId: string) => GameTemplate | undefined
  eventTypeOption: (gameId: string, eventType: EventType) => EventTypeOption | undefined
}

interface GameRow {
  id: string
  name: string
}

interface EventTypeRow {
  eventType: EventType
  label: string
  durationMin: number
  defaultCapacity: number
  maxCapacity: number
  minPlayers: number
}

/** Build the lookup surface directly over SQLite. Statements are prepared once,
 *  but rows are read for each call, so inserting a game and its event-type
 *  configs is sufficient for the running application to discover it. */
export function createTemplateRegistry(db: Db): TemplateRegistry {
  const listGames = db.prepare('SELECT id, name FROM games ORDER BY rowid')
  const getGame = db.prepare('SELECT id, name FROM games WHERE id = ?')
  const listEventTypes = db.prepare(
    `SELECT
       event_type       AS eventType,
       label,
       duration_min     AS durationMin,
       default_capacity AS defaultCapacity,
       max_capacity     AS maxCapacity,
       min_players      AS minPlayers
     FROM event_type_configs
     WHERE game_id = ?
     ORDER BY rowid`,
  )
  const getEventType = db.prepare(
    `SELECT
       event_type       AS eventType,
       label,
       duration_min     AS durationMin,
       default_capacity AS defaultCapacity,
       max_capacity     AS maxCapacity,
       min_players      AS minPlayers
     FROM event_type_configs
     WHERE game_id = ? AND event_type = ?`,
  )

  const eventTypesFor = (gameId: string): EventTypeOption[] =>
    (listEventTypes.all(gameId) as EventTypeRow[]).map((row) => ({ ...row }))

  const toTemplate = (row: GameRow): GameTemplate => ({
    ...row,
    eventTypes: eventTypesFor(row.id),
  })

  return {
    list: () => (listGames.all() as GameRow[]).map(toTemplate),
    get: (gameId) => {
      const row = getGame.get(gameId) as GameRow | undefined
      return row ? toTemplate(row) : undefined
    },
    eventTypeOption: (gameId, eventType) => {
      const row = getEventType.get(gameId, eventType) as EventTypeRow | undefined
      return row ? { ...row } : undefined
    },
  }
}

/** Seed data. This is the ONLY file in the codebase that names a game.
 *
 *  Game templates live in the database, not in code: `games` holds the game,
 *  `event_type_configs` holds one row per event type that game offers, and each
 *  row carries the four properties an event inherits (duration, default
 *  capacity, max capacity, minimum players). Adding a fourth game is therefore
 *  three inserts and no code change.
 *
 *  Absence of a row *is* the rule. There is no `event_type_configs` row for
 *  pokemon/COMMANDER, so no Commander pod can be scheduled for it — and the
 *  composite foreign key on `events` makes inserting one impossible even if the
 *  service layer's validation were wrong.
 */
import type { EventType } from '../../../shared/types'
import type { Db } from './index'

interface EventTypeSeed {
  eventType: EventType
  label: string
  durationMin: number
  defaultCapacity: number
  maxCapacity: number
  minPlayers: number
}

interface GameSeed {
  id: string
  name: string
  eventTypes: EventTypeSeed[]
}

export const GAMES: GameSeed[] = [
  {
    id: 'mtg',
    name: 'Magic: The Gathering',
    eventTypes: [
      { eventType: 'DRAFT', label: 'Booster Draft', durationMin: 180, defaultCapacity: 8, maxCapacity: 8, minPlayers: 8 },
      { eventType: 'SEALED', label: 'Sealed Deck', durationMin: 240, defaultCapacity: 16, maxCapacity: 30, minPlayers: 6 },
      { eventType: 'CONSTRUCTED', label: 'Constructed', durationMin: 180, defaultCapacity: 24, maxCapacity: 30, minPlayers: 4 },
      { eventType: 'COMMANDER', label: 'Commander Pod', durationMin: 120, defaultCapacity: 16, maxCapacity: 30, minPlayers: 4 },
    ],
  },
  {
    id: 'pokemon',
    name: 'Pokémon TCG',
    eventTypes: [
      { eventType: 'CONSTRUCTED', label: 'Constructed', durationMin: 150, defaultCapacity: 24, maxCapacity: 30, minPlayers: 4 },
      // The plan lists this as 180/32/30/6. A default of 32 exceeds both the
      // 30-player max and the table's own CHECK, so the default is clamped to 30.
      { eventType: 'PRERELEASE', label: 'Prerelease', durationMin: 180, defaultCapacity: 30, maxCapacity: 30, minPlayers: 6 },
    ],
  },
  {
    id: 'lorcana',
    name: 'Disney Lorcana',
    eventTypes: [
      { eventType: 'DRAFT', label: 'Booster Draft', durationMin: 120, defaultCapacity: 8, maxCapacity: 8, minPlayers: 6 },
      { eventType: 'SEALED', label: 'Sealed Deck', durationMin: 150, defaultCapacity: 16, maxCapacity: 30, minPlayers: 6 },
      { eventType: 'CONSTRUCTED', label: 'Constructed', durationMin: 120, defaultCapacity: 24, maxCapacity: 30, minPlayers: 4 },
    ],
  },
]

interface DemoEventSeed {
  id: string
  name: string
  gameId: string
  eventType: EventType
  /** Days from "now", so the agenda is never stale. */
  dayOffset: number
  hourUtc: number
  capacity: number
  players: string[]
}

/** Every demo event runs at the same shop, so `location` is a constant rather
 *  than a per-event field. Matches the fixture address in the test helpers. */
const VENUE = 'Card Kingdom, 5105 Leary Ave NW, Seattle, WA'

/** Player names are Dickens characters — unmistakably fictional, so no demo
 *  registration can be mistaken for a real person's. */
const DEMO_EVENTS: DemoEventSeed[] = [
  {
    id: 'demo-mtg-draft-thursday',
    name: 'Thursday Draft — 1 seat left',
    gameId: 'mtg',
    eventType: 'DRAFT',
    dayOffset: 3,
    hourUtc: 1,
    capacity: 8,
    players: [
      'Ebenezer Scrooge', 'Bob Cratchit', 'Oliver Twist', 'Wilkins Micawber',
      'Betsey Trotwood', 'Abel Magwitch', 'Sydney Carton'
    ],
  },
  {
    id: 'demo-mtg-constructed-friday',
    name: 'Friday Night Constructed',
    gameId: 'mtg',
    eventType: 'CONSTRUCTED',
    dayOffset: 5,
    hourUtc: 2,
    capacity: 24,
    players: ['Ebenezer Scrooge', 'Bob Cratchit'],
  },
  {
    id: 'demo-pokemon-league-challenge',
    name: 'League Challenge',
    gameId: 'pokemon',
    eventType: 'CONSTRUCTED',
    dayOffset: 2,
    hourUtc: 18,
    capacity: 24,
    players: ['Samuel Pickwick', 'Sam Weller', 'Nicholas Nickleby'],
  },
  {
    id: 'demo-pokemon-prerelease',
    name: 'Prerelease Weekend',
    gameId: 'pokemon',
    eventType: 'PRERELEASE',
    dayOffset: 9,
    hourUtc: 17,
    capacity: 30,
    players: ['Samuel Pickwick'],
  },
  {
    id: 'demo-lorcana-sealed-saturday',
    name: 'Sealed Deck Saturday',
    gameId: 'lorcana',
    eventType: 'SEALED',
    dayOffset: 6,
    hourUtc: 19,
    capacity: 16,
    players: ['Esther Summerson', 'Amy Dorrit', 'Herbert Pocket', 'Tommy Traddles'],
  },
  {
    id: 'demo-lorcana-draft',
    name: 'Booster Draft Night',
    gameId: 'lorcana',
    eventType: 'DRAFT',
    dayOffset: 12,
    hourUtc: 1,
    capacity: 8,
    players: ['Esther Summerson', 'Amy Dorrit'],
  },
]

/** lower(trim(name)) — the duplicate-registration key, computed in the app so
 *  the UNIQUE (event_id, player_key) constraint can do the detecting. */
export function playerKey(playerName: string): string {
  return playerName.trim().toLowerCase()
}

function startsAtIso(now: Date, dayOffset: number, hourUtc: number): string {
  const at = new Date(now)
  at.setUTCDate(at.getUTCDate() + dayOffset)
  at.setUTCHours(hourUtc, 0, 0, 0)
  return at.toISOString()
}

/** Idempotent: safe to call on every database open. Existing rows win — this
 *  only ever fills gaps.
 *
 *  That is what makes "the database is the source of truth" true rather than
 *  approximately true. Upserting would have made this array quietly canonical:
 *  a config row edited by hand would be silently overwritten by the next
 *  restart. The cost of the other choice is that editing a value in `GAMES`
 *  no longer reaches a database that already holds that row — delete
 *  `server/data/app.db` to re-bootstrap from this file.
 *
 *  `ON CONFLICT ... DO NOTHING` rather than `INSERT OR IGNORE`: both leave
 *  existing rows alone, but `OR IGNORE` suppresses *every* constraint
 *  violation, so a seed row that broke a CHECK would vanish without a word.
 *  This ignores exactly one thing — a primary key that is already present. */
export function seedGameTemplates(db: Db): void {
  const insertGame = db.prepare(
    `INSERT INTO games (id, name) VALUES (@id, @name)
     ON CONFLICT(id) DO NOTHING`,
  )
  const insertConfig = db.prepare(
    `INSERT INTO event_type_configs
       (game_id, event_type, label, duration_min, default_capacity, max_capacity, min_players)
     VALUES
       (@gameId, @eventType, @label, @durationMin, @defaultCapacity, @maxCapacity, @minPlayers)
     ON CONFLICT(game_id, event_type) DO NOTHING`,
  )

  db.transaction(() => {
    for (const game of GAMES) {
      insertGame.run({ id: game.id, name: game.name })
      for (const config of game.eventTypes) {
        insertConfig.run({ gameId: game.id, ...config })
      }
    }
  })()
}

/** Demo events for the agenda. Replaces any existing event data, deleting in
 *  foreign-key order so the whole thing is one transaction. */
export function seedDemoEvents(db: Db, now: Date = new Date()): void {
  const template = db.prepare(
    'SELECT duration_min, min_players FROM event_type_configs WHERE game_id = ? AND event_type = ?',
  )
  const insertEvent = db.prepare(
    `INSERT INTO events
       (id, name, game_id, event_type, starts_at, duration_min, capacity,
        min_players, location, confirmed_count, created_at)
     VALUES
       (@id, @name, @gameId, @eventType, @startsAt, @durationMin, @capacity,
        @minPlayers, @location, @confirmedCount, @createdAt)`,
  )
  const insertRegistration = db.prepare(
    `INSERT INTO registrations (id, event_id, player_name, player_key, created_at)
     VALUES (@id, @eventId, @playerName, @playerKey, @createdAt)`,
  )
  const createdAt = now.toISOString()

  db.transaction(() => {
    db.prepare('DELETE FROM registrations').run()
    db.prepare('DELETE FROM events').run()

    for (const demo of DEMO_EVENTS) {
      const config = template.get(demo.gameId, demo.eventType) as
        | { duration_min: number; min_players: number }
        | undefined
      if (!config) {
        throw new Error(
          `demo event ${demo.id} wants ${demo.gameId}/${demo.eventType}, which no template offers`,
        )
      }

      insertEvent.run({
        id: demo.id,
        name: demo.name,
        gameId: demo.gameId,
        eventType: demo.eventType,
        startsAt: startsAtIso(now, demo.dayOffset, demo.hourUtc),
        durationMin: config.duration_min,
        capacity: demo.capacity,
        minPlayers: config.min_players,
        location: VENUE,
        confirmedCount: demo.players.length,
        createdAt,
      })

      demo.players.forEach((playerName, i) => {
        insertRegistration.run({
          id: `${demo.id}-reg-${i + 1}`,
          eventId: demo.id,
          playerName,
          playerKey: playerKey(playerName),
          createdAt,
        })
      })
    }
  })()
}

export function seed(db: Db, now: Date = new Date()): void {
  seedGameTemplates(db)
  seedDemoEvents(db, now)
}

if (require.main === module) {
  // Required lazily: index.ts imports this module for seedGameTemplates, so a
  // top-level import here would be a cycle.
  const { openDatabase, DEFAULT_DB_PATH } = require('./index') as typeof import('./index')
  const db = openDatabase(DEFAULT_DB_PATH)
  seed(db)
  const { n } = db.prepare('SELECT count(*) AS n FROM events').get() as { n: number }
  console.log(`seeded ${GAMES.length} games and ${n} demo events into ${DEFAULT_DB_PATH}`)
  db.close()
}

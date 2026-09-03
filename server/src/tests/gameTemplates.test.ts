/** Requirement 2: game types are template-driven, not hard-coded strings. */
import { test, describe, before, after } from 'node:test'
import assert from 'node:assert/strict'

import {
  createEvent,
  errorBody,
  fetchGames,
  getEventDetail,
  minutesBetween,
  postEvent,
  startTestServer,
  VALID_EVENT,
  type TestServer,
} from './helpers'
import type { Db } from '../db'
import type { EventSummary, GameTemplate } from '../../../shared/types'

describe('game templates', () => {
  let srv: TestServer
  before(async () => { srv = await startTestServer() })
  after(async () => { await srv.close() })

  test('at least three games are offered', async () => {
    const games = await fetchGames(srv)
    assert.ok(games.length >= 3, `expected 3+ games, got ${games.length}`)
  })

  test('Magic: The Gathering is one of the games', async () => {
    const games = await fetchGames(srv)
    const mtg = games.find((g) => g.id === 'mtg')
    assert.ok(mtg, `no game with id "mtg" in ${games.map((g) => g.id).join(', ')}`)
    assert.equal(mtg.name, 'Magic: The Gathering')
  })

  test('game ids are unique', async () => {
    const ids = (await fetchGames(srv)).map((g) => g.id)
    assert.deepEqual([...new Set(ids)], ids)
  })

  test('every game offers at least one event type', async () => {
    for (const game of await fetchGames(srv)) {
      assert.ok(
        game.eventTypes.length >= 1,
        `${game.id} offers no event types`,
      )
    }
  })

  test('every event type carries duration, capacity and minimum-player rules', async () => {
    for (const game of await fetchGames(srv)) {
      for (const opt of game.eventTypes) {
        assert.ok(opt.label.length > 0, `${game.id}/${opt.eventType} has no label`)
        assert.ok(opt.durationMin > 0, `${game.id}/${opt.eventType} durationMin`)
        assert.ok(opt.minPlayers >= 2, `${game.id}/${opt.eventType} minPlayers`)
        assert.ok(
          opt.minPlayers <= opt.defaultCapacity,
          `${game.id}/${opt.eventType}: minPlayers > defaultCapacity`,
        )
        assert.ok(
          opt.defaultCapacity <= opt.maxCapacity,
          `${game.id}/${opt.eventType}: defaultCapacity > maxCapacity`,
        )
      }
    }
  })

  test('the template drives event duration', async () => {
    const games = await fetchGames(srv)
    for (const game of games) {
      for (const opt of game.eventTypes) {
        const event = await createEvent(srv, {
          gameId: game.id,
          eventType: opt.eventType,
          capacity: opt.defaultCapacity,
        })
        assert.equal(
          minutesBetween(event.startsAt, event.endsAt),
          opt.durationMin,
          `${game.id}/${opt.eventType} duration came from somewhere other than the template`,
        )
      }
    }
  })

  test('the template supplies the capacity when the organizer omits it', async () => {
    const games = await fetchGames(srv)
    const game = games[0]
    const opt = game.eventTypes[0]
    const event = await createEvent(srv, {
      gameId: game.id,
      eventType: opt.eventType,
      capacity: undefined,
    })
    assert.equal(event.capacity, opt.defaultCapacity)
  })

  test('the template labels the event type on the created event', async () => {
    const games = await fetchGames(srv)
    const opt = games[0].eventTypes[0]
    const event = await createEvent(srv, {
      gameId: games[0].id,
      eventType: opt.eventType,
      capacity: opt.defaultCapacity,
    })
    assert.equal(event.eventTypeLabel, opt.label)
  })

  test('the template wins over duration and minimum players sent by the client', async () => {
    // Nothing else proves these are ignored rather than merely absent from
    // CreateEventRequest: a client can put any JSON on the wire.
    const mtg = (await fetchGames(srv)).find((g) => g.id === 'mtg')
    assert.ok(mtg, 'mtg missing')
    const draft = mtg.eventTypes.find((o) => o.eventType === 'DRAFT')
    assert.ok(draft, 'mtg/DRAFT missing')

    const res = await fetch(`${srv.url}/api/events`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        ...VALID_EVENT,
        gameId: 'mtg',
        eventType: 'DRAFT',
        capacity: draft.defaultCapacity,
        durationMin: 5,
        minPlayers: 1,
      }),
    })
    assert.equal(res.status, 201)

    const { event } = (await res.json()) as { event: EventSummary }
    assert.equal(
      minutesBetween(event.startsAt, event.endsAt),
      draft.durationMin,
      'client-supplied durationMin overrode the template',
    )
    assert.equal(
      (await getEventDetail(srv, event.id)).minPlayers,
      draft.minPlayers,
      'client-supplied minPlayers overrode the template',
    )
  })

  test('an event type the game does not run is rejected', async () => {
    const games = await fetchGames(srv)
    const target = games.find((g) =>
      g.eventTypes.every((o) => o.eventType !== 'COMMANDER'),
    )
    assert.ok(target, 'expected at least one game that does not run COMMANDER')

    const res = await postEvent(srv, {
      gameId: target.id,
      eventType: 'COMMANDER',
      capacity: undefined,
    })
    assert.equal(res.status, 422)
    assert.equal((await errorBody(res)).code, 'UNSUPPORTED_EVENT_TYPE')
  })

  test('an unknown game is rejected', async () => {
    // VALIDATION_FAILED, not NOT_FOUND: nothing was requested that is missing;
    // a well-formed body named a game that does not exist, which is a bad
    // field in the payload and is reported as one.
    const res = await postEvent(srv, { gameId: 'not-a-real-game' })
    assert.equal(res.status, 422)

    const err = await errorBody(res)
    assert.equal(err.code, 'VALIDATION_FAILED')
    assert.ok(
      err.fields && 'gameId' in err.fields,
      `expected fields.gameId, got ${JSON.stringify(err.fields)}`,
    )
  })
})

describe('adding a fourth game through the database', () => {
  const FOURTH_GAME: GameTemplate = {
    id: 'starwars-unlimited',
    name: 'Star Wars: Unlimited',
    eventTypes: [
      {
        eventType: 'CONSTRUCTED',
        label: 'Premier Constructed',
        durationMin: 210,
        defaultCapacity: 18,
        maxCapacity: 30,
        minPlayers: 6,
      },
    ],
  }

  function insertFourthGame(db: Db): void {
    const insertGame = db.prepare('INSERT INTO games (id, name) VALUES (?, ?)')
    const insertEventType = db.prepare(
      `INSERT INTO event_type_configs
         (game_id, event_type, label, duration_min, default_capacity, max_capacity, min_players)
       VALUES
         (@gameId, @eventType, @label, @durationMin, @defaultCapacity, @maxCapacity, @minPlayers)`,
    )

    db.transaction(() => {
      insertGame.run(FOURTH_GAME.id, FOURTH_GAME.name)
      for (const option of FOURTH_GAME.eventTypes) {
        insertEventType.run({ gameId: FOURTH_GAME.id, ...option })
      }
    })()
  }

  let srv: TestServer
  before(async () => {
    // The only change another game needs: a `games` row and its
    // `event_type_configs` rows.
    srv = await startTestServer({ prepareDb: insertFourthGame })
  })
  after(async () => { await srv.close() })

  test('is discovered from database rows with no application code change', async () => {
    const games = await fetchGames(srv)
    assert.ok(games.some((g) => g.id === FOURTH_GAME.id))

    // The seed must already have run when prepareDb inserted: if prepareDb
    // ran first and the seed skipped a non-empty games table, this would be
    // the *only* game and the suite would be testing nothing.
    assert.ok(
      games.length >= 4,
      `expected the 3 seeded games plus the fourth, got ${games.map((g) => g.id).join(', ')}`,
    )
  })

  test('drives duration and default capacity like any built-in game', async () => {
    const event = await createEvent(srv, {
      gameId: FOURTH_GAME.id,
      eventType: 'CONSTRUCTED',
      capacity: undefined,
    })
    assert.equal(event.game.name, 'Star Wars: Unlimited')
    assert.equal(event.eventTypeLabel, 'Premier Constructed')
    assert.equal(event.capacity, 18)
    assert.equal(minutesBetween(event.startsAt, event.endsAt), 210)
  })
})

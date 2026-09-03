/** Requirement 2: game types are template-driven, not hard-coded strings. */
import { test, describe, before, after } from 'node:test'
import assert from 'node:assert/strict'

import {
  createEvent,
  errorBody,
  fetchGames,
  minutesBetween,
  postEvent,
  startTestServer,
  type TestServer,
} from './helpers'
import { createTemplateRegistry, GAME_TEMPLATES } from '../domain/gameTemplates'
import type { GameTemplate } from '../../../shared/types'

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
      const opt = game.eventTypes[0]
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
    assert.equal(res.status, 400)
    assert.equal((await errorBody(res)).code, 'UNSUPPORTED_EVENT_TYPE')
  })

  test('an unknown game is rejected', async () => {
    const res = await postEvent(srv, { gameId: 'not-a-real-game' })
    assert.equal(res.status, 400)
    assert.ok(['VALIDATION_FAILED', 'NOT_FOUND'].includes((await errorBody(res)).code))
  })
})

describe('adding a fourth game', () => {
  // The point of the template system: a new game is data, not a code change.
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

  let srv: TestServer
  before(async () => {
    srv = await startTestServer({
      templates: createTemplateRegistry([...GAME_TEMPLATES, FOURTH_GAME]),
    })
  })
  after(async () => { await srv.close() })

  test('shows up in the game list with no change to core event logic', async () => {
    const games = await fetchGames(srv)
    assert.ok(games.some((g) => g.id === FOURTH_GAME.id))
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

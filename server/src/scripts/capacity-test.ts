/** A visible demonstration of the last-seat rule, for a reader who would
 *  rather watch it than read `capacityContention.test.ts`.
 *
 *  `npm --prefix server run test:capacity`
 *
 *  Self-contained: it starts the real app over an in-memory database on an
 *  ephemeral port, so it needs no running server and touches no `app.db`. The
 *  requests are real HTTP, fired together, which is the only way to prove the
 *  claim — an in-process call would serialize itself and prove nothing.
 */
import { createEvent, errorBody, getEventDetail, register, startTestServer } from '../tests/helpers'
import type { TestServer } from '../tests/helpers'

interface Tally {
  created: number
  full: number
  other: number[]
  ms: number
}

async function stampede(
  srv: TestServer,
  eventId: string,
  attempts: number,
  namePrefix: string,
): Promise<Tally> {
  const started = Date.now()
  const responses = await Promise.all(
    Array.from({ length: attempts }, (_, i) => register(srv, eventId, `${namePrefix} ${i}`)),
  )

  const tally: Tally = { created: 0, full: 0, other: [], ms: Date.now() - started }
  for (const res of responses) {
    if (res.status === 201) tally.created++
    else if (res.status === 409 && (await errorBody(res)).code === 'EVENT_FULL') tally.full++
    else tally.other.push(res.status)
  }
  return tally
}

/** Every scenario answers the same two questions, so each one states both
 *  answers up front and is checked against them: how many of these requests
 *  were sold a seat, and what the event holds afterwards. The second is the
 *  one that catches a botched rollback — a duplicate that throws after the
 *  increment leaves `confirmed_count` ahead of the roster, and only comparing
 *  them shows it. */
interface Result {
  eventId: string
  tally: Tally
  /** Seats these requests should have been sold. */
  expectedSold: number
  /** What the event should hold once they are done, earlier players included. */
  expectedTotal: number
  seats: number
}

interface Scenario {
  title: string
  run: (srv: TestServer) => Promise<Result>
}

const SCENARIOS: Scenario[] = [
  {
    title: '40 players race for 8 seats',
    run: async (srv) => {
      const event = await createEvent(srv, { gameId: 'mtg', eventType: 'DRAFT', capacity: 8 })
      return {
        eventId: event.id,
        tally: await stampede(srv, event.id, 40, 'Rusher'),
        expectedSold: 8,
        expectedTotal: 8,
        seats: 8,
      }
    },
  },
  {
    title: '25 latecomers race for the one seat left in a pod of 8',
    run: async (srv) => {
      const event = await createEvent(srv, { gameId: 'mtg', eventType: 'DRAFT', capacity: 8 })
      for (let i = 0; i < 7; i++) await register(srv, event.id, `Early ${i}`)
      return {
        eventId: event.id,
        tally: await stampede(srv, event.id, 25, 'Latecomer'),
        expectedSold: 1,
        expectedTotal: 8,
        seats: 8,
      }
    },
  },
  {
    title: '75 players race for a 30-seat sealed event',
    run: async (srv) => {
      const event = await createEvent(srv, { gameId: 'mtg', eventType: 'SEALED', capacity: 30 })
      return {
        eventId: event.id,
        tally: await stampede(srv, event.id, 75, 'Max player'),
        expectedSold: 30,
        expectedTotal: 30,
        seats: 30,
      }
    },
  },
  {
    title: 'one impatient player double-clicks Register 10 times',
    run: async (srv) => {
      const event = await createEvent(srv, { gameId: 'mtg', eventType: 'DRAFT', capacity: 8 })
      const started = Date.now()
      const responses = await Promise.all(
        Array.from({ length: 10 }, () => register(srv, event.id, 'Impatient Player')),
      )
      // The nine refusals here are duplicates, not a full event, so `full`
      // stays 0 on purpose. Each one claimed a seat and then threw on the
      // insert; the roster check is what proves the rollback gave it back.
      return {
        eventId: event.id,
        tally: {
          created: responses.filter((r) => r.status === 201).length,
          full: 0,
          other: [],
          ms: Date.now() - started,
        },
        expectedSold: 1,
        expectedTotal: 1,
        seats: 8,
      }
    },
  },
]

async function main(): Promise<void> {
  const srv = await startTestServer()
  let failures = 0

  console.log('\nLast-seat contention — real HTTP, all requests in flight together\n')

  try {
    for (const scenario of SCENARIOS) {
      const { eventId, tally, expectedSold, expectedTotal, seats } = await scenario.run(srv)
      const detail = await getEventDetail(srv, eventId)

      const ok =
        tally.created === expectedSold &&
        tally.other.length === 0 &&
        detail.registeredCount === expectedTotal &&
        detail.registrations.length === expectedTotal

      console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${scenario.title}`)
      console.log(
        `        sold ${tally.created} of ${expectedSold} expected` +
          `  ·  refused as full ${tally.full}` +
          `  ·  ${tally.ms}ms`,
      )
      // The counter and the roster are two different records of the same fact.
      // Printing both is the point: they can only disagree if a transaction
      // committed half of itself.
      console.log(
        `        seat counter ${detail.registeredCount}/${seats}` +
          `  ·  roster ${detail.registrations.length}` +
          `  ·  expected ${expectedTotal}`,
      )
      if (tally.other.length > 0) {
        console.log(`        unexpected statuses: ${tally.other.join(', ')}`)
      }
      if (!ok) failures++
    }
  } finally {
    await srv.close()
  }

  console.log(
    failures === 0
      ? '\nNo event was oversold or undersold, and no counter drifted from its roster.\n'
      : `\n${failures} scenario(s) did not sell exactly the seats available.\n`,
  )
  process.exitCode = failures === 0 ? 0 : 1
}

main().catch((err: unknown) => {
  console.error(err)
  process.exitCode = 1
})

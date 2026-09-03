# TASKS — wotc-event-app

Working method: **test-driven**. Tests are written first and watched fail (RED)
before any implementation code is written (GREEN). Test command: `npm --prefix server test`.

## Terminology

**Event type**, never "format". `EventType` (`DRAFT`, `SEALED`, `CONSTRUCTED`,
`COMMANDER`) is what a game template offers; the assignment's phrase "available
play formats" maps to it. The bare word *format* is reserved for **deck-building
format** (MTG Modern, Lorcana Core Constructed, Pokemon Expanded), which the
README scopes out. Using one word for both would conflate a scheduling property
with a rules-set filter, so code, tests and test names all say event type.

## Build (in scope)

### 1. Event creation
An organizer can create an event with at minimum: name, game type, date + start
time, and player capacity. Capacity must support up to **30 players**.
- [x] RED — `server/src/tests/eventCreation.test.ts`
- [x] GREEN — `server/src/domain/events.ts` validation + store, `POST /api/events`
      and `GET /api/events/:id` in `app.ts`
- [x] GREEN — client `CreateEventForm`: game select drives event type, which
      drives duration, capacity default and range

### 2. Game types & templates
At least **3** trading card games, one of which is **Magic: The Gathering**
(other two chosen: **Pokémon TCG**, **Disney Lorcana**). Game types are a
lightweight **template** system, not hard-coded strings. Each template drives
**at least two** event properties (event types offered, default duration,
default/max capacity, minimum players to fire). A **4th game must be addable without
touching core event logic**.
- [x] RED — `server/src/tests/gameTemplates.test.ts` (incl. "adding a fourth game")
- [x] GREEN — `server/src/domain/gameTemplates.ts` registry, reading `games` +
      `event_type_configs`; the seed bootstraps a fresh database

### 3. Calendar view
Scheduled events display on a calendar so an organizer can see a given day.
Month grid *or* grouped-by-day agenda list both acceptable. Library is fine.
- [x] RED — `server/src/tests/calendar.test.ts` (day grouping + `/api/events` range query)
- [x] GREEN — `shared/calendar.ts` grouping + `GET /api/events?from&to` list endpoint
- [x] GREEN — client calendar UI: `EventAgenda`, a grouped-by-day agenda list

### 4. Calendar invite
Event page offers a downloadable **`.ics`** with correct title, start/end time
and location, importable into Google Calendar or Outlook.
- [x] RED — `server/src/tests/icsExport.test.ts`
- [x] GREEN — `/api/events/:id/calendar.ics`, serialized by
      `server/src/domain/icsInvite.ts`

### 5. Registration with QR code
Each event gets a registration link; the event page shows a **QR code** encoding
that link. Scanning leads to a simple registration form (name is enough).
Registration is **capacity-enforced on the server**, not just the UI — once full,
further registrations are rejected with a clear message.
- [x] RED — `server/src/tests/registration.test.ts`
- [x] RED — `server/src/tests/capacityContention.test.ts` (last-seat race)
- [x] GREEN — `POST /api/events/:id/registrations`, claimed by one conditional
      `UPDATE … RETURNING` inside a `BEGIN IMMEDIATE` transaction
      (`server/src/domain/registrations.ts`)
- [x] GREEN — client QR: `RegistrationQr` mounted on the event page, encoding
      the server's `registrationUrl`
- [x] GREEN — client registration form at `/events/:id/register`:
      `RegisterPage` + `RegistrationForm`, with a rendered outcome for each
      answer the server can give

## Do NOT build (out of scope)

A written checklist, not a test-enforced one — keeping it honest is a review
concern:
- [ ] no payments
- [ ] no email sending
- [ ] no recurring events
- [ ] no editing or cancelling events
- [ ] no admin dashboards

## Deliberate cuts

- **No client-side tests.** The client has no test runner, and adding vitest +
  Testing Library would cost more of the timebox than the two forms are worth.
  Neither form holds rules of its own — capacity ranges and event-type
  availability come from `/api/games`, capacity enforcement is the server's,
  and both submit paths are validated server-side, which `eventCreation.test.ts`
  and `registration.test.ts` cover over HTTP. The forms are checked by hand
  against `npm run dev`; the registration form's six outcomes were additionally
  driven in a real Chrome session, including a genuine lost race (load the page
  with one seat left, let another request take it, then submit).

## Test infrastructure
- [x] Node built-in test runner via existing `tsx` (zero new dependencies)
- [x] `server/src/tests/helpers.ts` — in-memory SQLite + ephemeral-port app per suite
- [x] `npm test` wired at repo root and in `server/package.json`
- [x] `server/src/tests/all.ts` barrel (Node 20 does not discover `.ts` in a dir)

## Starting RED baseline (2026-09-02)

82 tests. 0 pass, 82 fail.

All 82 failures come from the four deliberately unimplemented stubs, which
exist only to declare the interface the tests demand:

| Stub | Failing tests |
|---|---|
| `server/src/db/index.ts` → `openDatabase` | 74 (everything that needs the app) |
| `shared/calendar.ts` → `groupEventsByDay` | 6 |
| `server/src/domain/gameTemplates.ts` → `createTemplateRegistry` | 2 (+ empty `GAME_TEMPLATES`) |
| `server/src/app.ts` → `createApp` | reached once `openDatabase` lands |

Nothing passes, which is the point: every test describes behaviour that does not
exist yet.

Per-file leaf counts: gameTemplates 12, eventCreation 20, calendar 12,
icsExport 15, registration 17, capacityContention 6.

## Current status (2026-09-03, after GREEN step 7 + the registration form)

83 tests. 83 pass, 0 fail.

Requirement 5 is green. `registration.test.ts` (17) and
`capacityContention.test.ts` (6) came green together with one endpoint, since
they describe one path: `POST /api/events/:id/registrations`.

The seat is claimed by a single `UPDATE … WHERE confirmed_count < capacity …
RETURNING`, so no read precedes the write and the returned count is the one
that was written. The insert follows inside the same `BEGIN IMMEDIATE`
transaction; a `UNIQUE (event_id, player_key)` violation throws, which rolls
the increment back, so a duplicate never costs a seat. Refusals are thrown
rather than returned for that reason — better-sqlite3 rolls back on throw and
commits on return. The only SELECT is on the refusal path, telling a full event
(409) apart from a missing one (404).

The client gained `/events/:id/register`, the route the QR code has been
encoding since the event page landed. `useEventDetail` was pulled out of
`EventPage` so both routes share one loader rather than two copies of the same
fetch and stale-response guard.

Outcomes are split by whether anything is left to try. A claimed seat and a
full event are terminal, so the form is replaced by a panel; a duplicate name,
a blank name and an unreachable server keep the form. Focus moves with the
answer — onto the outcome heading when the page is done, back into the input
when it is not — because disabling the submit button drops focus to the body
and a terminal panel unmounts the form from under it.

`server/src/scripts/capacity-test.ts` now exists; `npm --prefix server run
test:capacity` had been pointing at a missing file. It fires four stampedes
over real HTTP and prints seats sold against seats expected, and the seat
counter against the roster length.

Verified beyond the suite: 30 concurrent `curl` processes against the
file-backed WAL database sold exactly the 7 remaining seats of 8, refused 23,
and left the counter and roster both reading 8.

## Earlier status (2026-09-03, after GREEN step 6 + the event page)

83 tests. 67 pass, 11 fail, 5 cancelled.

Requirement 4 is green: all 15 `icsExport` tests pass. The 14 that were red
came green together, since they all describe one serializer. The remaining
reds are requirement 5's registration endpoint — `registration.test.ts`,
`capacityContention.test.ts` — which is the next GREEN step.

The client gained the event page (`/events/:id`): event facts, seat count,
the .ics download, the QR code, and the roster. `RegistrationQr` existed but
had never been mounted; it is now. The QR encodes `/events/:id/register`,
which lands on the SPA's catch-all until the registration form arrives.

`server/src/index.ts` now advertises the Vite origin rather than the API port
when `PUBLIC_BASE_URL` is unset. The injected-config seam was already right;
only the fallback pointed at a port that serves no SPA route, so every QR code
generated by `npm run dev` encoded a path Express has no handler for.

## Earlier status (2026-09-02, after GREEN steps 1-4)

83 tests. 41 pass, 37 fail, 5 cancelled.

Green: game templates, adding a fourth game, creating an event, rejecting bad
event input, the registration link a QR code encodes. The remaining reds are
requirements 3, 4 and 5, which have no implementation yet.

One test was corrected rather than implemented against: `eventCreation.test.ts`
asserted `capacity === 16` for the shared `VALID_EVENT` fixture, whose capacity
is 8 because mtg/DRAFT is a single booster pod capped at 8. The literal
contradicted the fixture and the sibling test that asserts the same template
cap, so it could never pass; it now reads `VALID_EVENT.capacity`, matching how
every other assertion in that test is written.

## GREEN order (each step should turn a known set of reds green)

1. `openDatabase` + schema — unblocks every HTTP test.
2. `createTemplateRegistry` over `games` / `event_type_configs` — requirement 2.
3. `createApp` with `/api/games` — requirement 2 over HTTP.
4. `POST /api/events`, `GET /api/events/:id` + validation — requirement 1.
5. `GET /api/events?from&to` + `groupEventsByDay` — requirement 3.
6. `GET /api/events/:id/calendar.ics` — requirement 4.
7. `POST /api/events/:id/registrations` with the atomic conditional insert —
   requirement 5 and `capacityContention.test.ts`. **Done.**
8. Client: calendar view, QR on the event page, registration form. **Done.**

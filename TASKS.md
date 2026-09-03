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
- [ ] GREEN — event create/read endpoints + validation

### 2. Game types & templates
At least **3** trading card games, one of which is **Magic: The Gathering**
(other two chosen: **Pokémon TCG**, **Disney Lorcana**). Game types are a
lightweight **template** system, not hard-coded strings. Each template drives
**at least two** event properties (event types offered, default duration,
default/max capacity, minimum players to fire). A **4th game must be addable without
touching core event logic**.
- [x] RED — `server/src/tests/gameTemplates.test.ts` (incl. "adding a fourth game")
- [ ] GREEN — `server/src/domain/gameTemplates.ts` template registry + data

### 3. Calendar view
Scheduled events display on a calendar so an organizer can see a given day.
Month grid *or* grouped-by-day agenda list both acceptable. Library is fine.
- [x] RED — `server/src/tests/calendar.test.ts` (day grouping + `/api/events` range query)
- [ ] GREEN — `shared/calendar.ts` grouping + list endpoint
- [ ] GREEN — client calendar UI

### 4. Calendar invite
Event page offers a downloadable **`.ics`** with correct title, start/end time
and location, importable into Google Calendar or Outlook.
- [x] RED — `server/src/tests/icsExport.test.ts`
- [ ] GREEN — `/api/events/:id/calendar.ics`

### 5. Registration with QR code
Each event gets a registration link; the event page shows a **QR code** encoding
that link. Scanning leads to a simple registration form (name is enough).
Registration is **capacity-enforced on the server**, not just the UI — once full,
further registrations are rejected with a clear message.
- [x] RED — `server/src/tests/registration.test.ts`
- [x] RED — `server/src/tests/capacityContention.test.ts` (last-seat race)
- [ ] GREEN — registration endpoint + atomic conditional insert
- [ ] GREEN — client QR + registration form

## Do NOT build (out of scope)

A written checklist, not a test-enforced one — keeping it honest is a review
concern:
- [ ] no payments
- [ ] no email sending
- [ ] no recurring events
- [ ] no editing or cancelling events
- [ ] no admin dashboards

## Test infrastructure
- [x] Node built-in test runner via existing `tsx` (zero new dependencies)
- [x] `server/src/tests/helpers.ts` — in-memory SQLite + ephemeral-port app per suite
- [x] `npm test` wired at repo root and in `server/package.json`
- [x] `server/src/tests/all.ts` barrel (Node 20 does not discover `.ts` in a dir)

## Current RED baseline (2026-09-02)

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

## GREEN order (each step should turn a known set of reds green)

1. `openDatabase` + schema — unblocks every HTTP test.
2. `GAME_TEMPLATES` + `createTemplateRegistry` — requirement 2.
3. `createApp` with `/api/games` — requirement 2 over HTTP.
4. `POST /api/events`, `GET /api/events/:id` + validation — requirement 1.
5. `GET /api/events?from&to` + `groupEventsByDay` — requirement 3.
6. `GET /api/events/:id/calendar.ics` — requirement 4.
7. `POST /api/events/:id/registrations` with the atomic conditional insert —
   requirement 5 and `capacityContention.test.ts`.
8. Client: calendar view, QR on the event page, registration form.

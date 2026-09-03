# wotc-event-app

Take-home assessment for Senior Full Stack Engineer II.

## Structure

```
wotc-event-app/
├── package.json   dev script only (no workspaces)
├── client/        React + TypeScript SPA (Vite), port 5173
└── server/        Express + TypeScript API, port 3001
```

The client dev server proxies `/api` to the server, so the browser only ever talks to port 5173.

## Getting started

```
npm run install:all
npm run dev
```

`npm run dev` starts both processes with prefixed, interleaved logs; Ctrl-C stops both. Open http://localhost:5173, which redirects to the schedule.

The database seeds itself on first boot: opening it runs `schema.sql`, inserts the game templates (idempotently, on every open), and inserts six demo events if the `events` table is empty. One demo event is deliberately one seat from full.

### Tests

```
npm test
```

83 tests across 11 suites on `node:test` via `tsx`. Each test opens its own `:memory:` database and never touches `server/data/app.db`. To watch: `npm --prefix server run test:watch`. To run one file: `npx tsx --test server/src/tests/gameTemplates.test.ts`.

`npm --prefix server run test:capacity` is separate: a standalone script that fires concurrent registrations at a single remaining seat, so the last-seat outcome described below can be watched rather than taken on faith. It checks the result — seats sold, and the counter against the roster — not the mechanism; in one process the event loop is what serializes the writers, so the script does not exercise SQLite's lock.

## Pages

| URL | What it is |
|---|---|
| `/calendar` | The schedule, grouped by local day. `/` redirects here. |
| `/events/new` | Create an event. The game select drives the event type, which drives duration and the capacity default and range. |
| `/events/:id` | One event: when and where, seats taken, the `.ics` download, the registration QR code, and who has registered. |
| `/events/:id/register` | The registration form a scanned QR code lands on. Name is the only field. |

The `.ics` file's `LOCATION` is the venue address entered on the create form and stored verbatim on the event row; there is no venues table.

## Decisions

**REST, not GraphQL.** The job description emphasizes GraphQL and I was tempted to use it, but this app has one client, one organizer, and about six endpoints. There is no over-fetching problem for GraphQL to solve, and the `.ics` download fits REST naturally. If the API had to serve a player-facing app, the organizer view, and store sites, I would switch to GraphQL so each client could take its own slice of the data without nested requests.

**SQLite (better-sqlite3), not Postgres or in-memory.** An in-memory map has the fewest dependencies but needs hand-written atomicity and takes longer to debug. Postgres is the named production stack, but SQLite gives the same relational story — real constraints, a real transaction for the conditional update — while keeping the one-command start. It's synchronous, zero-config, and a single file.

## Design write-up

### Capacity: where it lives and how it's enforced

**Source of truth.** Capacity is a per-event column, `events.capacity`, alongside `events.confirmed_count` (seats currently claimed). A CHECK constraint in `schema.sql` enforces `0 <= confirmed_count <= capacity <= 30`, so nothing above the database can put an event into an invalid state. Seats remaining are never stored; they are derived as `capacity - confirmed_count`.

**How the number is chosen.** `event_type_configs` holds `default_capacity`, `max_capacity`, and `min_players` per (game, event type) pair. That pairing is load-bearing: the spec was ambiguous about whether the game alone should drive capacity, and I keyed it on the pair because an MTG Draft (8) and an MTG Commander pod (4) share a game but not a sensible capacity. On `POST /api/events` the server uses the organizer's `capacity` if provided, otherwise the template's default, then rejects unless `min_players <= capacity <= min(max_capacity, 30)`. The result is copied into `events.capacity`, so template edits affect future events only.

**Concurrent registrations for the last seat.** Registration never reads then writes. Inside a single `BEGIN IMMEDIATE` transaction:

1. `UPDATE events SET confirmed_count = confirmed_count + 1 WHERE id = ? AND confirmed_count < capacity` — one row changed means the seat is claimed; zero rows means refuse.
2. `INSERT INTO registrations (...)` — a `UNIQUE(event_id, player_key)` violation (where `player_key = lower(trim(name))`, so duplicates are case- and whitespace-insensitive) throws, rolling back the increment from step 1. A duplicate attempt never consumes a seat.

Two requests racing for the last seat cannot both succeed, and it is worth being precise about why, because two different mechanisms are doing the work.

*Within this process*, better-sqlite3 is synchronous and the transaction body contains no `await`, so it runs to completion without yielding the event loop. Node serializes the two registrations before SQLite is ever asked to arbitrate: the second request's UPDATE runs against the first's committed count and matches no rows.

*Against a second writer* — the `seed` script, a second instance, anything holding its own connection — the event loop guarantees nothing, and that is what `BEGIN IMMEDIATE` is for. It takes SQLite's write lock at `BEGIN` rather than upgrading from a reader mid-transaction, which is where `SQLITE_BUSY` comes from under contention. Deferred would be a latent bug the moment a second process appears.

The CHECK constraint is the last line: an over-capacity increment fails at the database even if both of the above were wrong.

The only SELECT is on the refusal path: after a zero-row UPDATE, `SELECT 1 FROM events WHERE id = ?` distinguishes a missing event (`404`) from a full one (`409 EVENT_FULL`). Nothing has been written at that point, so it cannot race anything. Duplicates return `409 DUPLICATE_REGISTRATION`.

**What the API exposes.** Event responses include `capacity`, `registeredCount` (from `confirmed_count`), and `isFull`. The client uses these for display only; it never decides whether a registration is allowed.

### Template system

**How it works.** Game templates are database rows, not code. Two tables:

- `games` — one row per game (`id`, `name`)
- `event_type_configs` — one row per (game, event type) pair: label, duration, default capacity, max capacity, minimum players

Magic has rows for Draft, Sealed, Constructed, and Commander. Pokémon has no Commander row. That absence is the whole rule: no config row, the game doesn't run that event type.

On event creation:

1. Validation looks up the game, then the (game, event type) config. A missing game or config is a clear error. The config supplies the capacity default, floor, and ceiling.
2. The template overrides the client. Duration and minimum players are never read from the request; they are copied from the config.
3. The database enforces it too. `events` has a foreign key on `(game_id, event_type)` pointing at `event_type_configs`, so an unsupported combination can't be inserted even if validation had a bug. (This relies on `PRAGMA foreign_keys = ON`, which the connection sets.)

Duration, min players, and capacity are copied onto the event row at creation, so editing a template later doesn't change events already on the calendar. Only display strings (game name, event type label) are joined at read time.

`gameTemplates.ts` is the lookup layer (`list`, `get`, `eventTypeOption`); the event read query and the seed script also query these tables directly. There is no in-memory copy of the games — rows are read on each call, so a new game is visible as soon as it's inserted.

The client renders entirely from `GET /api/games`: the game dropdown, the event type dropdown, and the "180 min · 8 seats" hint all come from the fetched configs.

**Adding a 4th trading card game.** Insert one `games` row and one or more `event_type_configs` rows. No code change, no restart. A test does exactly this: it inserts Star Wars: Unlimited, creates an event with it, and checks that duration and capacity come from the new rows. This holds because `EventType` is typed as `string` rather than a fixed union; I had it as a union initially and loosened it late.

**Adding a non-card game.** Depends on whether it fits the schema's assumptions: one room, one block of time, N seats, one person per seat.

- *Rows only:* a board game night, a painting session with 6 spots. The label is free text; nothing assumes card-game vocabulary.
- *One-line code changes:* capacity is capped at 30 (a CHECK on both tables plus a constant in `events.ts`), so a 200-seat launch party needs all three raised. Minimum players must be ≥ 2, so a solo activity is rejected.
- *New columns or tables:*
  - Team events (Two-Headed Giant, 3v3). Capacity is counted per person and registration is one row per name; teams need a party-size field or a `teams` table, plus a different registration flow.
  - Multi-day or multi-session events. An event has exactly one start and one duration. This is the largest change — a `sessions` table — and it ripples into the `.ics` export and the calendar's day grouping. If this were a requirement I'd revisit the schema from the ground up.
  - Waitlists. Capacity is one `confirmed_count` guarded by one conditional UPDATE; a waitlist changes that concurrency model rather than sitting beside it.
  - Entry fees, age limits, equipment: just extra config columns.

### What was cut, and what I'd build next

Deliberately not built:

- **Deck-building format** (Modern, Core Constructed, Expanded). See the AI section for why the proposed shape was rejected. It's a discovery/filter concern; nothing in creation, capacity, or registration depends on it, and the end-to-end flow is complete without it.
- **Pod-size granularity.** Capacity is a flat headcount. Adding it is one column on `event_type_configs` and a multiple-of check in `validateCreateEvent`.
- **Event description and image.**
- **Verified player identity.** Dedupe is a normalized name match. Next would be an email or SMS-verified identifier.
- **Cost / payment.**
- **Search** with filters (format, map, distance).

## AI usage

**Claude web UI (Projects), Opus 5 and Fable 5.1** — planning and design review. Projects let me keep the job description and assessment instructions as context without putting them in the repo, and leave a clearer trail than Claude Code.

Rejected proposal: a global `Format` enum (`STANDARD`, `MODERN`, `EXPANDED`, …) shared across games. MTG Standard, Pokémon Standard, and Lorcana Core Constructed are unrelated rule sets, so one enum would either conflate them under a single value or force a code edit per new game — the opposite of what the template system is for. If format is added, it belongs as per-game data, not a shared vocabulary.

**Claude Code, Opus 5** — implementation, not decisions. Plans came from the web UI chats; I got better results handing Claude Code the finished plan in isolation from the reasoning that produced it.

Fixed output:

- At the planning stage it filled the README with fabricated "process" narrative that fit the assessment rubric but described nothing I had done. Removed.
- It added a separate in-memory event registry that had to be kept in sync with the database, against the plan. Ripped out; the database is the only store.
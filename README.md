# wotc-event-app
Take home assessment for Full Stack Senior Software Engineer II

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

`npm run dev` starts both processes with prefixed, interleaved logs; Ctrl-C stops both. Then open http://localhost:5173, which redirects to the schedule.

## Pages

| URL | What it is |
|---|---|
| `/calendar` | The schedule, grouped by local day. `/` redirects here. |
| `/events/new` | Create an event. The game select drives the event type, which drives duration and the capacity default and range. |
| `/events/:id` | One event: when and where, seats taken, the `.ics` download, the registration QR code, and who has registered. Reached by clicking any card on the schedule. |

### Registration links and the QR code

The QR code encodes an absolute URL, so a phone that has never talked to this
machine can still open it. That origin is configuration, not something read off
a `Host` header, and defaults to the Vite dev origin — the only one that serves
the `/events/:id/register` route:

```
PUBLIC_BASE_URL=http://10.0.0.5:5173 npm run dev   # scan from a real phone
```

Without it the link says `localhost`, which resolves to the phone itself. The
server echoes the origin it is advertising at boot, so a wrong one is visible
before anyone tries to scan. If Vite reports a port other than 5173 because
5173 was taken, set `PUBLIC_BASE_URL` to match.

Each side can also be run on its own:

```
npm --prefix server run dev
npm --prefix client run dev
```

## Notes on Ordering and Decisions

With a 3 hour timebox, the priority is getting end-to-end flow implemented and absolutely nailing the "last spot" problem.
Likely the choice with the biggest downriver effect is going to be how to make last spot claiming server-side authoritative.
My preferred option is the atomic conditional update: update the db and then see if any rows were changed. It scales well and allows for a clean user experience. 
See Last Ticket Contention section for the decision process.
Having decided on better-sqlite3 as the library of choice, the next load-bearing decision s the API surface. The job description emphasizes GraphQL, so I am tempted to use it to show that I know how, but the app has one client, one organizer, and only about 6 endpoints. There's no over-fetching problem for GraphQL to solve here and I need to support an .ics download which fits more naturally with a REST API. I'll go with REST and design the db tables from the JSON shapes the endpoints need to return. If the assignment was to make an API that will support a user facing app and the organizer view, and store sites I would switch to GraphQL to better handle the different slices of the data without requiring multiple/nested requests.
I'll need to pick my games. Mtg, Pokemon, and Lorcana. Two games with enough legacy to have to juggle multiple event types and formats, and then a newer game that includes championship level play even in a local game store. I think this will provide a representative list of problems to solve.


## Last Ticket Contention

The option I want to use: atomic conditional update, is based on the way a sql db naturally allows for synchronous check-and-decrement. If I want to stick with the MVP, an in-memory map is the least likely to introduce unforeseen dependencies or bloat. However, it's only correct if the check-and-decrement happens synchronously in a single tick, and we only run one Node process.

ts
```
const stock = new Map<string, number>();

function tryTake(id: string): boolean {
  const qty = stock.get(id) ?? 0;
  if (qty <= 0) return false;
  stock.set(id, qty - 1);
  return true;
}
```

Node's single-threaded event loop makes this atomic as long as there's no await between the read and the write. The moment we insert an async call (validate user, log, etc.) between them, we've reintroduced the race. So we'd do the decrement first, then do async work, and increment back if something fails.

Limitations: state lost on restart, breaks with cluster mode / multiple instances / serverless.

I think this is too flimsy for something so load-bearing to the app, so I'll look at the smallest real database.

Smallest real database: SQLite via better-sqlite3. Only slightly preferable to Postgres, but it keeps the one-command start. It's synchronous, zero-config, a single file, and the conditional update is exactly the pattern from before:

ts
```
const take = db.prepare(
  "UPDATE items SET qty = qty - 1 WHERE id = ? AND qty > 0"
);
const ok = take.run(id).changes === 1;
```

This survives restarts, and because better-sqlite3 is synchronous it has the same "no interleaving" property as the Map. Multiple Node processes on the same file also stay correct (SQLite serializes writers), so it survives moving to cluster. Migrating to Postgres later is a near-verbatim SQL change.

## No! Bad AI!

Claude Web UI (Projects) - Opus 5 & Fable 5.1
Used because it allows me to store multiple contextually relevant files (like the job description and assessment instructions) without having to include them in my web app. Maintains a better trail of what I did than Claude Code. 
- Deck-building Format (e.g. Modern, Core Constructed, Expanded) 
Format is a discovery/filter concern: nothing in creation, capacity, or registration depends on it, and the end-to-end flow the spec asks for is complete without it. It could be added later as a nullable field on the event summary but making it a plain shared enum is a bad idea because of the namespace collision. MTG Standard, Pokémon Standard, and Lorcana Core Constructed are unrelated rule sets, so a global enum would either conflate them under one value or force a code edit per new game.

Claude Code - Opus 5
Used for implementation speed, not decision making. Plans came from chats in the Web UI. 
- Already (in planning stage, not yet implemented) this resulted in Claude helpfully filling in the README with all sorts of stories about our "process" that would have fit the requirements of the assessment instructions but were entirely fabricated.
I realized I got better outcomes when the reasoning resulted in a plan and Claude Code was given the plan, isolated from the reasoning context.
- The most egregious add was that Claude Code added an entirely separate event registry that had to be kept in sync with the db. 

## What Next
Events
 - Description
 - Image

 Registration
 - a unique identifier that requires verification (email, sms) to dedupe players instead of the string match
 - cost / payment

Other
- new locations and map with filters including Format
 

// - **Design write-up (~1 page)** answering:
     - How did you determine and enforce how many people can attend an event? Where does capacity live, and what happens under concurrent registrations for the last seat?
     - How does your template system work, and what would adding a 4th game (or a non-card game) require?
     - What did you deliberately cut or fake to stay in the timebox, and what would you build next?
   - **AI usage note (a few sentences):** which tools you used and for what, and one example of AI output you rejected or had to fix.


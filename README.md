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

`npm run dev` starts both processes with prefixed, interleaved logs; Ctrl-C stops both. Then open http://localhost:5173 — it should show a message fetched from `/api/hello`.

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

Claude Code - Opus 5
Used for implementation speed, not decision making. Plans came from chats in the Web UI. Already (in planning stage, not yet implemented) this resulted in Claude helpfully filling in the README with all sorts of stories about our "process" that would have fit the requirements of the assessment instructions but were entirely fabricated.
I realized I got better outcomes when the reasoning resulted in a plan and Claude Code was given the plan, isolated from the reasoning context.




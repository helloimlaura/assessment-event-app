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

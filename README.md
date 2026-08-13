# af-api

A small, dependency-light JSON API over [allfootballapp.com](https://www.allfootballapp.com):
leagues, teams, squads and full player detail — including market value history
and transfers.

Runs locally, caches in memory, and ships with browsable docs at `/docs`.

## Quick start

```bash
npm install
cp .env.example .env   # optional; npm start loads it automatically
npm start              # http://localhost:3000
```

Requires Node **>= 20.18** (uses built-in `fetch`, `node:test` and
`--env-file-if-exists`). The only runtime dependencies are `express` and
`swagger-ui-dist`.

```bash
curl http://localhost:3000/api/leagues
curl http://localhost:3000/api/league/196/teams
curl http://localhost:3000/api/team/2891/squad
curl http://localhost:3000/api/player/50410856
```

## Endpoints

All routes are `GET` and return `application/json`. No auth.

| Route | What it returns |
| --- | --- |
| `/health` | Liveness plus whether docs are mounted |
| `/api/leagues` | Every competition, with `cid` |
| `/api/league/:cid/teams` | Teams in a competition |
| `/api/team/:id/squad` | Squad grouped by type (players, coach) |
| `/api/player/:id` | Player detail, market value history, transfers |
| `/api/league/:cid/players` | **Slow.** Every player in a competition, aggregated |

Every response carries `href` links pointing back at *this* API, so you can walk
leagues → teams → squad → player without constructing URLs. Links are built from
the request's scheme and `Host`, so they are correct behind a proxy and are
never stored in the cache.

`/api/league/:cid/players` fans out over every team and every player in the
competition. Expect minutes, not seconds, on a cold cache; progress is logged
every 25 players and per-player failures are collected into an `errors` array
rather than failing the request.

Errors are uniform: `{ "error": true, "message": "...", "status": 404 }`.

**Full reference:** [API.md](API.md) — every field, every response shape.
**Spec:** [openapi.yaml](openapi.yaml) (OpenAPI 3.1).

## Docs

With the server running and `DOCS_ENABLED` not disabled:

- `/docs` — Swagger UI with working "Try it out"
- `/openapi.yaml` — the spec
- `/docs/reference.md` — [API.md](API.md), raw

UI assets are served from the bundled `swagger-ui-dist` package rather than a
CDN, so the page works offline and behind a firewall.

## Configuration

`npm start` runs with `--env-file-if-exists=.env`; plain environment variables
work identically. See [.env.example](.env.example).

| Variable | Default | Effect |
| --- | --- | --- |
| `PORT` | `3000` | Listen port |
| `DOCS_ENABLED` | on | `false`, `0`, `off` or `no` unmounts `/docs`, `/openapi.yaml` and the reference |
| `CACHE_TTL_MS` | per-kind | Single TTL override (ms) for every cache kind |

## How it works

```text
src/
  index.js          express app + wiring
  routes.js         route handlers, cache keys, href injection
  lib/fetcher.js    polite HTTP: spacing, concurrency cap, timeout, retry
  lib/scraper.js    upstream JSON endpoints → normalized squad/player shapes
  lib/parsers.js    HTML parsing for leagues and teams
  lib/cache.js      in-memory TTL cache
  lib/docs.js       /docs, /openapi.yaml, /docs/reference.md
```

**Two upstream shapes.** Squads and players come from JSON endpoints
(`/sport-data/...`); leagues and teams are parsed out of the site's HTML
standings page.

**Being a good citizen.** [fetcher.js](src/lib/fetcher.js) enforces a global
500 ms minimum spacing between request starts, caps concurrency at 3, times out
at 15 s, and retries `429`/`5xx`/network errors three times with 1s/3s/9s
backoff. These are global, so the aggregate endpoint cannot stampede upstream.

**Caching.** Responses are memoised in-process and lost on restart. Defaults:
leagues 24 h, teams 1 h, squad 1 h, player 6 h, aggregate 6 h.

**Language.** Upstream localises names by an `app` parameter; this API sends
`app=af`, so player names, nationalities and positions come back in Latin script.
The one exception is league names, which are scraped from the site's Indonesian
pages and so are in Indonesian ("Piala Dunia").

## Tests

```bash
npm test
```

Uses the built-in `node:test` runner. Upstream is never contacted — the parser
and scraper tests run against recorded fixtures in [test/fixtures/](test/fixtures/),
and the route tests inject fakes for the scraper and fetcher.

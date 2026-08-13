# af-api — API Reference

Local JSON API over `allfootballapp.com`: leagues, teams, squads and player detail
(including market value history and transfers).

```bash
npm install
cp .env.example .env   # optional; npm start loads it automatically
npm start              # http://localhost:3000
npm test
```

- **Base URL:** `http://localhost:3000`
- **Auth:** none
- **Content type:** `application/json; charset=utf-8`
- **Method:** `GET` only

## Configuration

`npm start` runs with `--env-file-if-exists=.env`, so a `.env` beside
`package.json` is picked up with no dependency and no code; plain environment
variables work identically. See [.env.example](.env.example).

| Variable | Default | Effect |
| --- | --- | --- |
| `PORT` | `3000` | Listen port |
| `DOCS_ENABLED` | on | Serves the public docs. `false`, `0`, `off` or `no` disables them |
| `CACHE_TTL_MS` | per-kind | One TTL for every cache kind, in ms |

## Browsable docs

When `DOCS_ENABLED` is not turned off, three extra routes are served:

| Path | What |
| --- | --- |
| `/docs` | Swagger UI over the spec, with working "Try it out" |
| `/openapi.yaml` | The OpenAPI 3.1 spec |
| `/docs/reference.md` | This document, raw |

The UI assets are served from the bundled `swagger-ui-dist` package, not a CDN,
so the page works offline. The spec's first server entry is the relative URL
`/`, so "Try it out" hits whichever host is serving the docs.

With `DOCS_ENABLED=false` all three paths — and the UI assets — return the
standard `404` error object, and `GET /health` reports `"docs": false`.

## Language of the data

Upstream is Dongqiudi's backend, which localises every human-readable string
(player names, nationalities, positions, preferred foot, the age suffix) based on
the `app` query parameter it receives. This API sends `app=af` (AllFootball), so
names come back in Latin script — `Said Brahmi`, not `赛义德-布拉赫米`. See
[scraper.js](src/lib/scraper.js).

One exception: `/api/leagues` and `/api/league/:cid/teams` are scraped from the
site's Indonesian HTML pages (`/id/...`), so **league names are in Indonesian**
("Piala Dunia", "Peringkat FIFA"). Team names are Latin either way.

## Links

Every `href` in a response is an absolute URL pointing at **this API**, so you can
walk leagues → teams → squad → player without building URLs yourself. Links are
built from the request's own scheme and `Host` header and are injected
per-request, so they are never baked into the cache.

| Response | `href` points to |
| --- | --- |
| `leagues[]` | `/api/league/{cid}/teams` |
| `teams[]` | `/api/team/{team_id}/squad` |
| `groups[].members[]` | `/api/player/{person_id}` — `null` if the member has no id |
| player object | itself, `/api/player/{id}` |

No response links to `allfootballapp.com`. Upstream image URLs still appear in
`logo`, since those are the actual assets.

## Caching

Responses are memoised in-process (lost on restart). TTLs from
[cache.js](src/lib/cache.js), overridable for all kinds with `CACHE_TTL_MS`:

| Kind | Key | TTL |
| --- | --- | --- |
| leagues | `leagues` | 24 h |
| teams | `teams:<cid>` | 1 h |
| squad | `squad:<id>` | 1 h |
| player | `player:<id>` | 6 h |
| aggregate | `aggregate:<cid>` | 6 h |

Upstream calls are rate-limited globally: max 3 concurrent, ≥500 ms between
request starts, 15 s timeout, 3 retries with 1 s/3 s/9 s backoff on 429 and 5xx.

## Errors

Every error is the same shape:

```json
{ "error": true, "message": "team id must be numeric", "status": 400 }
```

| Status | When |
| --- | --- |
| 400 | Path id is not numeric |
| 404 | Unknown route, no teams for a competition, or player has no `base_info` |
| 502 | Upstream network error, non-JSON body, or still failing after retries |
| 504 | Upstream timed out (15 s) |
| 500 | Internal error (message is always `Internal server error`) |

---

## `GET /health`

```json
{ "ok": true, "docs": true }
```

`docs` reflects the `DOCS_ENABLED` toggle for the running instance.

## `GET /api/leagues`

All competitions listed on the standings data page. Names are Indonesian.

```json
{
  "count": 278,
  "leagues": [
    {
      "cid": "61",
      "name": "Piala Dunia",
      "logo": "https://img1.qunliao.info/fastdfs7/M00/51/EC/rBUBsmk9FlqAR8PLAAAk2Uhs-J4036.png",
      "href": "http://localhost:3000/api/league/61/teams"
    },
    {
      "cid": "100001",
      "name": "Peringkat FIFA",
      "logo": null,
      "href": "http://localhost:3000/api/league/100001/teams"
    }
  ]
}
```

`cid` is the competition id used by the two `/api/league/:cid/...` routes.
`logo` is `null` when the entry has no image. Note that many entries here are
rankings or cups with no standings table, so their `href` will 404.

## `GET /api/league/:cid/teams`

Teams in competition `cid` (numeric).

`GET /api/league/196/teams`

```json
{
  "count": 12,
  "teams": [
    {
      "team_id": "2884",
      "name": "Al-Ahli Doha",
      "slug": "al-ahli-doha",
      "logo": "https://img-sd.allfootballapp.com/fastdfs3/M00/B5/82/ChOxM1xC2Y6AJ_IEAABE_R3rjHc619.png",
      "href": "http://localhost:3000/api/team/2884/squad"
    }
  ]
}
```

`slug` is the upstream URL slug, kept for reference; `href` is this API's squad
route for the team.

**Errors:** `400` non-numeric cid · `404` competition has no teams.

## `GET /api/team/:id/squad`

Squad for a team, grouped by role. `id` is a `team_id` from the teams route.

`GET /api/team/2889/squad`

```json
{
  "team_id": "2889",
  "count": 30,
  "groups": [
    {
      "type": "attacker",
      "members": [
        {
          "person_id": "50205787",
          "person_name": "Said Brahmi",
          "person_en_name": "Said Brahmi",
          "age": 31,
          "shirtnumber": "30",
          "position": "attacker",
          "statistic": [
            { "Appearances": "-" },
            { "Goals": "-" },
            { "Assists": "-" },
            { "Market Value (EUR)": "100K" }
          ],
          "weekly_salary": null,
          "nationality_name": "Qatar/Algeria",
          "captain": false,
          "href": "http://localhost:3000/api/player/50205787"
        }
      ]
    }
  ]
}
```

| Field | Notes |
| --- | --- |
| `count` | Total members across all groups, coaches included |
| `groups[].type` | `coach`, `goalkeeper`, `defender`, `midfielder`, `attacker` |
| `age` | Integer, or `null` if upstream omits it |
| `shirtnumber` | String, or `null` |
| `statistic` | Passthrough array of single-key objects; keys vary by competition |
| `nationality_name` | May list several, slash-separated (`"Qatar/Algeria"`) |
| `captain` | Derived from upstream's captain badge |
| `href` | This API's `/api/player/{person_id}`; `null` if the member has no id |

An unknown but numeric team id yields `{"count": 0, "groups": []}`, not a 404.

**Errors:** `400` non-numeric id.

## `GET /api/player/:id`

Full player detail. `id` is a `person_id` from a squad response.

`GET /api/player/50205787`

```json
{
  "person_id": "50205787",
  "name": "Said Brahmi",
  "en_name": "Said Brahmi",
  "nationality": "Qatar",
  "other_nationality": ["Algeria"],
  "date_of_birth": "1995-06-24",
  "height_cm": 174,
  "weight_kg": 74,
  "foot": "Right",
  "position": "attacker",
  "age": 31,
  "status": "active",
  "current_team": {
    "team_id": "50002889",
    "team_name": "Qatar SC",
    "shirtnumber": "30"
  },
  "market_value_eur": 100000,
  "weekly_salary": null,
  "contract": "2027-06-30",
  "market_value_history": [
    {
      "record_date": "2024-06-01",
      "market_value": 1000000,
      "market_value_text": "1.00m",
      "age": 25,
      "team": { "id": "50002888", "name": "Al-Sadd" }
    }
  ],
  "transfers": [
    {
      "date": "2025-07-01",
      "from_club": "Al Khor SC",
      "to_club": "Qatar SC",
      "fee": null,
      "type": "Free transfer"
    }
  ],
  "injuries": [],
  "career": [],
  "character": { "styles": [], "strength": [], "weakness": [] },
  "href": "http://localhost:3000/api/player/50205787"
}
```

| Field | Notes |
| --- | --- |
| `market_value_eur` | Integer euros, `null` if unknown |
| `market_value_history` | Sorted ascending by `record_date`; empty for many players |
| `transfers[].fee` | `null` for free / undisclosed moves (upstream sends `""`) |
| `injuries`, `career`, `character` | Raw upstream passthrough; shape not guaranteed |
| `current_team.team_id` | Upstream's person-scoped team id (`50002889`), **not** the squad-route `team_id` (`2889`) — so there is deliberately no link on it |
| `href` | Self link, `/api/player/{id}` |

**Errors:** `400` non-numeric id · `404` no such player (`Player not found (no base_info)`).

## `GET /api/league/:cid/players`

Every unique player across every team in a competition, with full detail.
Coaches are excluded. **Slow and expensive** — it walks each team's squad and
then each player's detail page at ≥500 ms per upstream request, so a 12-team
league is several hundred requests and can take many minutes on a cold cache.
Progress is logged to stdout every 25 players.

`GET /api/league/196/players`

```json
{
  "cid": "196",
  "team_count": 12,
  "player_count": 341,
  "players": [ { "...": "same object as /api/player/:id" } ],
  "errors": [ { "person_id": "50410856", "message": "Upstream responded 404 ..." } ]
}
```

Individual player failures are collected in `errors` rather than failing the
request; `player_count` counts only successes. The whole response is cached for
6 h under `aggregate:<cid>`.

**Errors:** `400` non-numeric cid · `404` competition has no teams.

---

## Route map

| Method | Path | Cache kind |
| --- | --- | --- |
| GET | `/health` | — |
| GET | `/docs` | — (only when `DOCS_ENABLED` is on) |
| GET | `/openapi.yaml` | — (only when `DOCS_ENABLED` is on) |
| GET | `/docs/reference.md` | — (only when `DOCS_ENABLED` is on) |
| GET | `/api/leagues` | leagues |
| GET | `/api/league/:cid/teams` | teams |
| GET | `/api/league/:cid/players` | aggregate |
| GET | `/api/team/:id/squad` | squad |
| GET | `/api/player/:id` | player |

Anything else returns `404 {"error":true,"message":"Not found: GET /path","status":404}`.

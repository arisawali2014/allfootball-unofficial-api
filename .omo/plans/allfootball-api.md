# allfootball-api - Work Plan

## TL;DR (For humans)
<!-- Fill this LAST, after the detailed plan below is written, so it summarizes the REAL plan. -->
<!-- Plain English for a non-engineer: NO file paths, NO todo numbers, NO wave/agent/tool names. -->

**What you'll get:** A small Node.js API you run locally (`npm start`) that turns allfootballapp.com into JSON: every competition's league ID, each league's clubs, each club's squad, and every player's full profile — including market value in €, weekly salary, contract, value history and transfer fees.

**Why this approach:** The site's pages embed a hidden JSON API that we verified live; calling those endpoints directly is faster and far more reliable than parsing web pages. Two HTML parses (league list, team list) are only used where the API is needlessly complex. All calls are polite (½-second spacing, max 3 at a time, retries) so we don't hammer the site.

**What it will NOT do:** It won't bypass the site's protections (their terms prohibit automated scraping — you accepted that risk), won't store anything in a database, and won't scrape any site other than allfootballapp.com.

**Effort:** Medium
**Risk:** Medium - the site forbids automated extraction and could block the API's requests at any time.
**Decisions to sanity-check:** Express + plain JavaScript (no TypeScript); results cached in memory only (lost on restart); coaches excluded from the all-players endpoint.

Your next move: approve, or run a high-accuracy review. Full execution detail follows below.

---

> TL;DR (machine): Medium effort, Medium risk (ToS/robots prohibition) — Node 24 + Express local JSON API over allfootballapp.com; 6 endpoints incl. player market value; tests-after via node --test + live curl matrix.

## Scope
### Must have
A Node.js REST API in `D:\projects\work\allfootball` that serves football data scraped (read-only HTTP GETs) from allfootballapp.com:

- `GET /health` → `{ok:true}`
- `GET /api/leagues` → all ~283 competitions `[{cid, name, logo}]`, parsed from the standings page sidebar HTML
- `GET /api/league/:cid/teams` → clubs of league `:cid` `[{team_id, name, slug, logo, href}]`, parsed from `https://www.allfootballapp.com/id/data?cid=:cid&tab=standings&expanded=1` HTML anchors `/id/teams/<id>-<slug>`
- `GET /api/team/:id/squad` → roster groups from `GET https://www.allfootballapp.com/sport-data/soccer/biz/dqd/v1/team/member_v2/:id?app=dqd` (groups: coach/attacker/midfielder/defender/goalkeeper; fields person_id, person_name, person_en_name, age, shirtnumber, type, statistic, weekly_salary, nationality_name, captain flag)
- `GET /api/player/:id` → full player detail from `GET https://www.allfootballapp.com/sport-data/soccer/biz/dqd/person/detail/:id` — normalized: identity (person_id, name, en_name, nationality, other_nationality, date_of_birth, height_cm, weight_kg, foot, position, age, status), current_team {team_id, team_name, shirtnumber}, **market_value_eur (number), weekly_salary, contract**, market_value_history[], transfers[] (incl. fee `money`), injuries[], career, character
- `GET /api/league/:cid/players` → aggregate: teams → squads (coach group skipped) → player details; array of normalized players + meta {cid, team_count, player_count, errors[]}; bounded concurrency 3, continue-on-fail
- Infra: polite fetch wrapper (UA header, 15s timeout, 3 retries exp backoff 1s/3s/9s on 429/5xx/network, global min 500ms spacing, concurrency limiter), in-memory TTL cache (leagues 24h, teams/squad 1h, player 6h, aggregate 6h; `CACHE_TTL_MS` env override), unified error shape `{error:true,message,status}` (upstream 404→404, retries exhausted→502, timeout→504, no teams for cid→404)
- Tests: `node --test` unit tests w/ committed fixtures (league/team HTML anchors, member_v2 JSON, person detail JSON) + cache/fetcher logic (local mock HTTP server)
- Minimal README: setup, run, endpoint table, example curls
- Config: `PORT` env default 3000; plain JS ESM (`"type":"module"`); only runtime dependency = express

### Must NOT have (guardrails, anti-slop, scope boundaries)
- No database, no auth, no Docker, no frontend, no deployment config
- No data sources other than allfootballapp.com; no writing to the upstream site (read-only GETs only)
- No rate-limit/WAF bypass, no parallel-burst scraping (never exceed concurrency 3 / 500ms spacing — no DoS)
- No git init / commits (workspace is not a git repo; do not create one)
- No TypeScript, no build step, no extra deps beyond express (devDeps: none beyond node builtins)
- No changes outside `D:\projects\work\allfootball` (except reading `.omo/` drafts)

## Verification strategy
> Zero human intervention - all verification is agent-executed.
- Test decision: **tests-after** + `node --test` (built-in, zero deps). Unit tests for parsers/cache/fetcher against committed fixtures; live QA = curl matrix against the booted server (happy + failure), asserting fields/counts against the live upstream.
- Evidence: .omo/evidence/task-<N>-allfootball-api.<ext>

## Execution strategy
### Parallel execution waves
> Target 5-8 todos per wave. Fewer than 3 (except the final) means you under-split.

- **Wave 1** (parallel): T1 project scaffold · T2 fetcher+cache lib (+tests)
- **Wave 2** (parallel, needs T2): T3 HTML parsers leagues/teams (+fixtures+tests) · T4 API fetchers squad/player + normalizers (+fixtures+tests)
- **Wave 3** (needs T3+T4): T5 routes + server wiring incl. aggregate endpoint
- **Wave 4** (needs T5): T6 live curl QA matrix + fixes · T7 README (parallel with T6 — different files; T6's findings may tweak README examples, so T7 runs after T6 finishes)

### Dependency matrix
| Todo | Depends on | Blocks | Can parallelize with |
| --- | --- | --- | --- |
| T1 scaffold | — | T2 (package.json), T5 | T2 (different files; T2 must not touch package.json) |
| T2 fetcher+cache | T1 (needs package.json for node --test run config? No — node --test works standalone; but tests live in repo → order after T1 to avoid file conflicts) | T3, T4, T5 | — |
| T3 HTML parsers | T2 | T5 | T4 |
| T4 API fetchers | T2 | T5 | T3 |
| T5 routes+server | T3, T4 | T6, T7 | — |
| T6 live QA | T5 | T7 (README examples) | — |
| T7 README | T6 | — | — |

## Todos
> Implementation + Test = ONE todo. Never separate.
<!-- APPEND TASK BATCHES BELOW THIS LINE WITH edit/apply_patch - never rewrite the headers above. -->

### Wave 1

- [ ] 1. Project scaffold
  What to do: In `D:\projects\work\allfootball` create `package.json` (`{"name":"af-api","version":"1.0.0","type":"module","scripts":{"start":"node src/index.js","test":"node --test test/"},"dependencies":{"express":"^4.21.0"}}`), run `npm install`, create dirs `src/`, `src/lib/`, `test/`, `test/fixtures/`, `.omo/evidence/`, and `.gitignore` containing exactly `node_modules/`. Must NOT: create README (T7 owns), src files (T2-T5 own), run `git init`, add any dependency other than express, touch anything outside the workspace root.
  Parallelization: Wave 1 | Blocked by: — | Blocks: T2 (needs package.json present)
  References (executor has NO interview context - be exhaustive): workspace root `D:\projects\work\allfootball` currently contains only `.codegraph/` and `.omo/`; Node v24.5.0 / npm 11.5.1 verified installed; plan Scope section above lists the full file layout this project converges to.
  Acceptance criteria (agent-executable): `npm install` exits 0; `node -e "import('express').then(()=>console.log('ok'))"` prints ok; dirs src/, src/lib/, test/, test/fixtures/, .omo/evidence/ exist; `Get-ChildItem` workspace shows no extra top-level files beyond package.json, package-lock.json, .gitignore, dirs.
  QA scenarios (name the exact tool + invocation): happy = `npm install` then `node -e "import('express').then(()=>console.log('ok'))"` → ok. failure = `node -e "JSON.parse(require('fs').readFileSync('package.json','utf8'))"` must not throw (invalid JSON fails fast). Evidence: `.omo/evidence/task-1-allfootball-api.txt` (npm install tail + dir listing).
  Commit: N | no git repo

- [ ] 2. Polite fetcher + TTL cache libs (+unit tests)
  What to do: Create `src/lib/fetcher.js` exporting `fetchJson(url)`, `fetchText(url)`, `upstreamGate` and `UpstreamError`. Behavior: global min 500ms spacing between upstream request STARTS (timestamp-gated queue); headers `User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) af-api/1.0`, `Accept: application/json`; timeout 15000ms via `AbortSignal.timeout(15000)`; retry up to 3 attempts (backoff 1s/3s/9s) ONLY on HTTP 429, 5xx, or network/abort errors; non-retryable 4xx throws `UpstreamError` with `.status` and `.url`; 2xx → fetchJson parses JSON (invalid JSON throws UpstreamError status 502), fetchText returns string; concurrency limiter max 3 (hand-rolled promise pool, no deps). Options arg may override `minSpacingMs`/timeouts for tests. Create `src/lib/cache.js` exporting `cacheGet(key)`, `cacheSet(key, value, kind)` where kind ∈ {leagues:24h, teams:1h, squad:1h, player:6h, aggregate:6h}, plus `cacheClear()`; env `CACHE_TTL_MS` (integer ms) overrides ALL kinds when set. Tests: `test/fetcher.test.js` uses a local `node:http` server — happy 200 JSON parse; 404 → UpstreamError.status===404; 429-then-200 → succeeds with attempt count 2; timeout path (server sleeps 20ms, timeout 5ms) → throws; spacing (minSpacingMs=50, two calls) → elapsed ≥50ms. `test/cache.test.js` — set/get, expiry (ttl 5ms), env override via fresh import with `CACHE_TTL_MS=1`. Must NOT: add npm deps; use node-cron/timers for cache (lazy expiry on read); hardcode any upstream URL here (T3/T4 own URLs).
  Parallelization: Wave 1 | Blocked by: T1 | Blocks: T3, T4, T5
  References: upstream endpoints live under `https://www.allfootballapp.com` and require a browser UA (plain curl without UA was NOT tested — always send the UA); upstream is rate-limit-sensitive per plan Risk → spacing+retry are mandatory behaviors, not optional; Node 24 fetch + AbortSignal.timeout are built-in.
  Acceptance criteria: `node --test test/fetcher.test.js test/cache.test.js` exits 0, all tests pass.
  QA scenarios: happy = local mock server 200 → parsed object returned (assert deep equal). failure = mock 404 → caught UpstreamError with status 404 (assert), mock 429×2 then 200 → 3 attempts logged (assert counter). Evidence: `.omo/evidence/task-2-allfootball-api.txt` (full `node --test` output).
  Commit: N | no git repo

### Wave 2

- [ ] 3. HTML parsers: leagues + teams (+fixtures +unit tests)
  What to do: Create `src/lib/parsers.js` exporting `parseLeagues(html)` and `parseTeams(html)`. `parseLeagues`: find anchors `href="/id/data/?cid=<digits>&..."` in the standings page HTML, extract cid (string), name (anchor inner text with tags stripped, HTML entities decoded: at minimum `&amp;`→`&`, `&#39;`→`'`, `&quot;`→`"`, `&lt;`/`&gt;`), logo (img src inside anchor, may be absent → null); dedupe by cid, first occurrence wins; return `[{cid, name, logo}]`. `parseTeams`: find anchors `href="/id/teams/<digits>-<slug>"`, extract team_id (string), slug, name (inner text stripped/decoded), logo (img src or null), href; dedupe by team_id; return `[{team_id, name, slug, logo, href}]`. Capture fixtures: `curl -s -A "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" "https://www.allfootballapp.com/id/data?cid=196&tab=standings&expanded=1" -o test/fixtures/standings-196.html`. Tests `test/parsers.test.js`: parseLeagues(fixture) length ≥250 and includes `{cid:"196", name:"Qatar - Liga Utama"}`; parseTeams(fixture) length ===12 and includes team_id "2891" slug "al-sadd" and team_id "140622"; entity decoding unit case with a synthetic snippet; dedupe case (same cid twice → 1 entry). Must NOT: fetch network inside parsers (pure string functions); use a DOM/cheerio dep (regex + string ops only — the anchor shapes are fixed and verified); modify fetcher/cache.
  Parallelization: Wave 2 | Blocked by: T2 | Blocks: T5
  References: verified 2026-08-12 — standings HTML contains 283 league anchors (sample: cid=61 "Piala Dunia", cid=100001 "Peringkat FIFA") and 12 team anchors `/id/teams/140622-lusail-sc`, `/id/teams/2884-al-ahli-doha`, `/id/teams/2885-al-arabi`, `/id/teams/2886-al-gharafa`, `/id/teams/2889-qatar-sc`, `/id/teams/2890-al-rayyan`, `/id/teams/2891-al-sadd`, `/id/teams/2892-al-shamal`, `/id/teams/2893-al-wakrah`, `/id/teams/6582-al-sailiya`, `/id/teams/8351-al-duhail`, `/id/teams/8353-al-shahaniya`. NOTE hrefs in raw HTML contain `&amp;` entity-encoding of `&` — decode before extracting query params if parsing them (cid comes from the path pattern so this is mostly cosmetic, but name extraction MUST decode entities).
  Acceptance criteria: `node --test test/parsers.test.js` exits 0; fixture file exists and is ≥400KB.
  QA scenarios: happy = fixture parse yields the asserted counts/entries (above). failure = `parseLeagues("")` → `[]` (no throw); `parseTeams("<html>garbage</html>")` → `[]`. Evidence: `.omo/evidence/task-3-allfootball-api.txt`.
  Commit: N | no git repo

- [ ] 4. API fetchers + normalizers: squad, player detail (+fixtures +unit tests)
  What to do: Create `src/lib/scraper.js` exporting `getSquad(teamId)` and `getPlayer(personId)` (both async, using `fetchJson` from `./fetcher.js`). `getSquad`: GET `https://www.allfootballapp.com/sport-data/soccer/biz/dqd/v1/team/member_v2/${teamId}?app=dqd` → normalize `data.list[]` → `{team_id, count, groups:[{type, members:[{person_id, person_name, person_en_name, age, shirtnumber, position: member.type, statistic, weekly_salary, nationality_name, captain: Boolean(member.captain_logo)}]}]}` (preserve upstream group order coach,attacker,midfielder,defender,goalkeeper; missing fields → null, never throw on a sparse member). `getPlayer`: GET `https://www.allfootballapp.com/sport-data/soccer/biz/dqd/person/detail/${personId}` → normalize to `{person_id, name: base_info.person_name, en_name: base_info.person_en_name, nationality, other_nationality, date_of_birth, height_cm: Number||null, weight_kg: Number||null, foot, position, age: Number||null, status, current_team:{team_id, team_name, shirtnumber} (from base_info.team_info), market_value_eur: Number(base_info.market_value)||null, weekly_salary: base_info.weekly_salary||null, contract: base_info.contract||null, market_value_history: flatten history_market_values (object keyed by year) → array [{record_date, market_value, market_value_text, age, team:{id,name} (parse from team_info "@{id=..; name=..; ...}" mini-format — regex `id=([^;]+)` and `name=([^;]+)`)}] sorted by record_date ascending, transfers: transfer_info[] → [{date: announced_date, from_club: from_club_name, to_club: to_club_name, fee: money||null, type: type||null}], injuries: injury_records||[], career: career_info||null, character: character_info||null}`. If upstream returns HTTP 404 or a body with no `base_info`, throw UpstreamError status 404. Capture fixtures: `curl -s -A "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" "https://www.allfootballapp.com/sport-data/soccer/biz/dqd/v1/team/member_v2/2891?app=dqd" -o test/fixtures/member_v2-2891.json` and `... /person/detail/50410856 -o test/fixtures/person-50410856.json`. Tests `test/scraper.test.js` (pure-normalizer tests: export the normalize fns too, feed fixtures): squad fixture → groups contain goalkeeper, count ≥25, every member has person_id; player fixture → market_value_eur===1000000, en_name contains "Dilrosun", market_value_history length ≥20, transfers length ===12, current_team.team_name==="Al-Sadd". Must NOT: hit network in tests (fixtures only); drop unknown extra fields silently from the RAW fixture (normalizer may select fields, that's fine); coach-filter here (that's T5 aggregate's job); add deps.
  Parallelization: Wave 2 | Blocked by: T2 | Blocks: T5
  References: verified live 2026-08-12 — member_v2/2891: 5 groups, 37 rows total, group types exactly coach/attacker/midfielder/defender/goalkeeper, member fields person_id, person_name, person_en_name, age, shirtnumber, type, statistic, weekly_salary (may be ""), nationality_name, nationality_logo, captain_logo ("" when not captain), transfer_data (often null). person/detail/50410856 top-level keys: base_info, trophy_info, player_trophy_info, honor_info, transfer_info (array len 12), career_info, player_career_info, character_info, history_market_values (object keyed by year string, each an array), injury_records. base_info.market_value is a STRING number in EUR ("1000000"); history entries have team_info/person_info as "@{id=2891; name=Al-Sadd; ...}" mini-format strings. Response is clean UTF-8 JSON.
  Acceptance criteria: `node --test test/scraper.test.js` exits 0; both fixtures exist (member fixture ≥20KB, person fixture ≥25KB).
  QA scenarios: happy = fixture normalization asserts above pass. failure = normalizer fed `{}` → getPlayer normalize throws 404 UpstreamError; squad fixture with a member missing optional fields → nulls, no throw. Evidence: `.omo/evidence/task-4-allfootball-api.txt`.
  Commit: N | no git repo

### Wave 3

- [ ] 5. Express routes + server wiring (all 6 endpoints incl. aggregate)
  What to do: Create `src/routes.js` exporting `createRouter({scraper, parsers, fetchText})` (dependency injection for tests) and `src/index.js` wiring real deps + `app.listen(process.env.PORT||3000)`. Endpoints: `GET /health` → `{ok:true}`. `GET /api/leagues` → fetchText standings URL `https://www.allfootballapp.com/id/data?cid=196&tab=standings&expanded=1` (cache kind leagues 24h) → parseLeagues → `{count, leagues:[...]}`. `GET /api/league/:cid/teams` → fetchText `https://www.allfootballapp.com/id/data?cid=${cid}&tab=standings&expanded=1` (cache teams; validate `:cid` = digits only else 400) → parseTeams → empty array ⇒ 404 `{error:true,...}` else `{count, teams:[...]}`. `GET /api/team/:id/squad` → scraper.getSquad (cache squad). `GET /api/player/:id` → scraper.getPlayer (cache player). `GET /api/league/:cid/players` → teams (reuse teams logic) → for each team scraper.getSquad, skip `type==="coach"` group, collect unique person_ids → scraper.getPlayer each through the fetcher's concurrency gate (≤3) with per-player try/catch → errors entries `{person_id, message}`; response `{cid, team_count, player_count, players:[...], errors:[...]}` (cache aggregate). Error middleware: UpstreamError → its status (404/502/504), unknown route → 404 JSON, anything else → 500 JSON; ALL error bodies `{error:true, message, status}`. Tests `test/api.test.js`: build router with STUB scraper/parsers/fetchText (no network), listen on port 0: /health 200; /api/player/1 returns stub shape; unknown player → 404 JSON error shape; /api/league/abc/teams → 400; unknown route → 404. Must NOT: add middleware deps (no cors/helmet/morgan — not asked); hardcode port; cache errors (only successful responses cached); expose stack traces in responses; change lib files (if a lib gap blocks you, report it, don't patch silently).
  Parallelization: Wave 3 | Blocked by: T3, T4 | Blocks: T6, T7
  References: endpoint behaviors + error-shape contract from plan Scope; DI pattern so T6 can also boot the real server; express 4.21 Router idioms; cache keys format `"leagues"`, `"teams:<cid>"`, `"squad:<id>"`, `"player:<id>"`, `"aggregate:<cid>"`. Aggregate runtime at polite rate ≈ 6-8 min for Qatar (12 teams × ~35 players ≈ 420 details at 500ms spacing / concurrency 3) — log progress to console every 25 players (`aggregate <cid>: n/total`).
  Acceptance criteria: `node --test test/api.test.js` exits 0; `node --check src/index.js && node --check src/routes.js` exit 0; server boots (`PORT=3123 node src/index.js`) and `curl -s http://localhost:3123/health` → `{"ok":true}`.
  QA scenarios: happy = stubbed /api/player/1 → 200 + stub JSON; failure = stubbed scraper throwing UpstreamError(404) → response 404 with `{error:true}` and NO stack trace; stubbed scraper throwing generic Error → 500 `{error:true}`. Evidence: `.omo/evidence/task-5-allfootball-api.txt` (test output + health curl).
  Commit: N | no git repo

### Wave 4

- [ ] 6. Live end-to-end QA matrix against real upstream (+ fix loop)
  What to do: Boot the real server `PORT=3123 node src/index.js`, then run and RECORD every check (curl output → evidence): (a) `GET /api/leagues` → count ≥250, contains cid "196" named "Qatar - Liga Utama"; (b) `GET /api/league/196/teams` → count===12, contains team_id "2891"; (c) `GET /api/team/2891/squad` → count ≥25, groups include goalkeeper; (d) `GET /api/player/50410856` → market_value_eur===1000000, en_name contains "Dilrosun", market_value_history non-empty, transfers non-empty; (e) `GET /api/league/196/players` → player_count ≥300, EVERY player object has keys person_id + market_value_eur (null allowed), errors array length logged (≤5% of player_count else investigate); record wall-clock duration; (f) failure paths: `GET /api/player/999999999` → 404 JSON `{error:true}`; `GET /api/league/999999/teams` → 404; `GET /nope` → 404 JSON; (g) cache proof: repeat (d), second response time < 100ms (cached) — record both timings. Any failure → fix in the owning module and re-run the FULL matrix (not just the failed check). Must NOT: loosen polite limits to make (e) faster; mark pass without recorded evidence; leave the server running when done.
  Parallelization: Wave 4 | Blocked by: T5 | Blocks: T7
  References: expected live values verified 2026-08-12 (see T3/T4 references); aggregate (e) legitimately takes ~6-8 min — that is expected, not a hang.
  Acceptance criteria: all checks (a)-(g) pass with evidence recorded; `node --test test/` (full suite) exits 0 afterwards.
  QA scenarios: happy = checks (a)-(e), (g) pass. failure = checks (f) return specced error JSON. Evidence: `.omo/evidence/task-6-allfootball-api.txt` (commands + key outputs + timings).
  Commit: N | no git repo

- [ ] 7. README (usage doc, matches implementation exactly)
  What to do: Write `README.md`: one-line overview; **ToS/risk note** (upstream robots.txt + site footer prohibit automated extraction — this tool is polite/low-rate/read-only; use at own risk); requirements (Node ≥18, only dep express); `npm install` / `npm start` / `PORT` + `CACHE_TTL_MS` env table; endpoint table with one example curl + a SHORT trimmed sample JSON each (copy the REAL response shapes from T5/T6 outputs, not from memory); aggregate endpoint note (~6-8 min cold, cached after); project layout tree. Must NOT: document endpoints/fields that don't exist; add badges/screenshots; exceed ~120 lines.
  Parallelization: Wave 4 | Blocked by: T6 (uses its real outputs) | Blocks: —
  References: `.omo/evidence/task-6-allfootball-api.txt` for real sample outputs; plan Scope table for endpoint list.
  Acceptance criteria: every route + env var mentioned in README exists in `src/routes.js`/`src/index.js` (grep each); every sample JSON key path matches the normalizer code.
  QA scenarios: happy = grep each documented route string in src/routes.js → found. failure = README mentions a field not produced by src/lib/scraper.js → fix README. Evidence: `.omo/evidence/task-7-allfootball-api.txt`.
  Commit: N | no git repo

## Final verification wave
> Runs in parallel after ALL todos. ALL must APPROVE. Surface results and wait for the user's explicit okay before declaring complete.
- [ ] F1. Plan compliance audit
- [ ] F2. Code quality review
- [ ] F3. Real manual QA
- [ ] F4. Scope fidelity

## Commit strategy
No git repository in the workspace — executor must NOT run `git init` or commit anything. Deliverable is files on disk.

## Success criteria
- `npm install` clean; only runtime dep = express.
- `node --test test/` — full unit/integration suite green (no network in tests).
- Server boots via `npm start` (PORT env, default 3000).
- Live curl matrix (T6) all pass against the real upstream: leagues ≥250, 12 Qatar teams, squad ≥25, player market value correct, aggregate ≥300 players, failure paths return specced error JSON, cache proven (2nd call <100ms).
- Polite limits enforced in code: 500ms spacing, concurrency ≤3, 3 retries — verifiable by reading src/lib/fetcher.js.
- Evidence files present under `.omo/evidence/` for tasks 1-7.

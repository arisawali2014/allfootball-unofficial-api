---
slug: allfootball-api
status: plan-written
intent: clear
pending-action: deliver summary + ask start-work vs dual sentinel review
approach: Node.js 24 Express API that scrapes verified allfootball JSON endpoints, serves leagues/teams/players as JSON with TTL cache + polite fetch wrapper
---

# Draft: allfootball-api

## Components (topology ledger)
| id | outcome | status | evidence |
|---|---|---|---|
| C1 af-api | REST API serving league->club->player data incl. market value from allfootballapp.com | active | .omo/plans/allfootball-api.md |

## Open assumptions (announced defaults)
| assumption | adopted default | rationale | reversible? |
|---|---|---|---|
| framework | Express (only runtime dep) + Node built-in fetch | ecosystem default, user asked "nodejs api" | yes |
| language | plain JS ESM (no TS, no build step) | minimal; user gave no stack prefs | yes |
| output | JSON only (CSV fork moot after API pivot) | it's an API | yes |
| cache | in-memory TTL Map (leagues 24h, teams/squad 1h, player 6h, aggregate 6h; CACHE_TTL_MS override) | upstream is slow + ToS-restricted; no DB asked | yes |
| coaches | squad endpoint returns raw groups incl. coach group; aggregate players endpoint skips coach group | user asked "players" | yes |
| locale | id (as user browsed); fields keep person_name + person_en_name both | matches user URL | yes |
| port | PORT env, default 3000 | convention | yes |

## Findings (cited - verified live 2026-08-12)
- cid=196 = Qatar Stars League. Nuxt SSR site; JSON API under `https://www.allfootballapp.com/sport-data/soccer/biz/...`.
- Leagues catalog: standings page HTML contains 283 anchors `href="/id/data/?cid=<n>&tab=..."` with name+logo -> verified regex parse (cid=61 Piala Dunia etc.).
- Teams: standings page HTML contains `/id/teams/<id>-<slug>` links -> 12 clubs for cid=196 (140622 Lusail, 2884 Al-Ahli, 2885 Al-Arabi, 2886 Al-Gharafa, 2889 Qatar SC, 2890 Al-Rayyan, 2891 Al-Sadd, 2892 Al-Shamal, 2893 Al-Wakrah, 6582 Al-Sailiya, 8351 Al-Duhail, 8353 Al-Shahaniya).
- Squad: `GET /sport-data/soccer/biz/dqd/v1/team/member_v2/<teamId>?app=dqd` -> data.list[] groups coach/attacker/midfielder/defender/goalkeeper; fields person_id, person_name, person_en_name, age, shirtnumber, type, statistic, weekly_salary, nationality_name, captain_logo, transfer_data. Verified: Al-Sadd 37 rows, Al-Duhail 35.
- Player detail: `GET /sport-data/soccer/biz/dqd/person/detail/<person_id>` -> base_info (market_value string-number EUR, weekly_salary, contract, date_of_birth, height, weight, foot, position, team_info{team_id,team_name,shirtnumber}, status), history_market_values by year, transfer_info[], career_info, injury_records, character_info. Verified: person_id 50410856 Dilrosun MV=1000000 (1.00m EUR).
- Charset: UTF-8 clean (verified with Python decode).
- RISK: robots.txt disallows /sport-data/, /api/, /match-api/; footer ToS: automated extraction not permitted. User informed + approved. Polite low-rate only (500ms spacing, concurrency <=3, retries), no DoS.

## Decisions (with rationale)
- HTML link parse (leagues, teams) over `sportdata-v2` template APIs: template API returns {template,content,sort,click} needing template engine parsing; HTML anchors verified simpler/stable.
- Aggregate endpoint `/api/league/:cid/players`: teams->squads->details, bounded concurrency 3, per-player error capture, continue-on-fail.
- Error shape: `{error:true,message,status}`; upstream 404 -> 404, exhausted retries -> 502, timeout -> 504, no teams for cid -> 404.

## Scope IN
- 6 endpoints: /health, /api/leagues, /api/league/:cid/teams, /api/team/:id/squad, /api/player/:id, /api/league/:cid/players
- lib: polite fetcher (UA, 15s timeout, 3 retries exp backoff, 500ms spacing, concurrency limiter), TTL cache, scraper (parsers+fetchers, normalized outputs)
- unit tests (node --test) with committed fixtures for parsers/fetcher/cache; live curl QA matrix happy+failure
- minimal README usage

## Scope OUT (Must NOT have)
- No DB, no auth, no Docker, no frontend, no deployment
- No scraping beyond allfootballapp.com (no other data sources)
- No bypassing rate limits/WAF; no parallel-burst scraping (no DoS)
- No writing to the upstream site; read-only GETs
- No git init (workspace is not a repo; executor must not init without user request)

## Open questions
None.

## Approval gate
status: approved 2026-08-12 (user: "approve", then "add the cid list" folded in)

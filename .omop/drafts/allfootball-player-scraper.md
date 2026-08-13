# Draft: allfootball-player-scraper

status: awaiting-approval
pending action: write `.omop/plans/allfootball-player-scraper.md`
approach: Node.js REST API (Express) that scrapes verified allfootball JSON endpoints, serves league/teams/players as JSON

## Request (user)
Scrape https://www.allfootballapp.com/id/data?cid=196&tab=standings&expanded=1 :
league -> club -> players -> all player details including cost (market value).
UPDATE 2026-08-12: user pivoted -> "buat api menggunakan nodejs dengan cara scrape itu" = build a Node.js API using that scraping approach. CSV fork moot; output = JSON API.

## Recon facts (verified live)
- cid=196 = "Qatar - Liga Utama" (Qatar Stars League). Site = Nuxt SSR + JSON API. Empty workspace (only .codegraph). Node v24.5.0, npm 11.5.1.
- Team URLs on standings page: `/id/teams/<id>-<slug>` — 12 clubs: 140622 Lusail, 2884 Al-Ahli, 2885 Al-Arabi, 2886 Al-Gharafa, 2889 Qatar SC, 2890 Al-Rayyan, 2891 Al-Sadd, 2892 Al-Shamal, 2893 Al-Wakrah, 6582 Al-Sailiya, 8351 Al-Duhail, 8353 Al-Shahaniya.
- Squad roster API (verified): `GET https://www.allfootballapp.com/sport-data/soccer/biz/dqd/v1/team/member_v2/<teamId>?app=dqd` -> `data.list[]` groups coach/attacker/midfielder/defender/goalkeeper; player fields: person_id, person_name (localized), person_en_name, age, shirtnumber, type, statistic, weekly_salary, nationality_name, transfer_data.
- Player detail API (verified): `GET https://www.allfootballapp.com/sport-data/soccer/biz/dqd/person/detail/<person_id>` -> top keys: base_info (person_id, names, nationality, other_nationality, date_of_birth, height, weight, foot, position, age, team_info{team_id, team_name, shirtnumber, type}, market_value string-number EUR, weekly_salary, contract, status), transfer_info[], history_market_values (by year), career_info, injury_records, character_info, trophy_info.
- Market value currency = EUR. Encoding: clean UTF-8.
- Standings/ranking alt endpoints (`sportdata-v2.allfootballapp.com/soccer/biz/data/*`, season_id=26123) = template-driven, more fragile; HTML link extraction preferred for team list.
- robots.txt disallows /sport-data/, /api/, /match-api/ etc. Footer ToS forbids automated extraction ("Akses otomatis... tidak diizinkan"). RISK — user informed, approves; plan = polite low-rate, no DoS.

## Adopted defaults (per two filters)
- Stack: Node.js 24 + Express (only runtime dep) + built-in fetch. No TypeScript (plain JS ESM, keep minimal).
- Endpoints:
  - GET /health
  - GET /api/leagues             (ADD 2026-08-12 user req: cid catalog — parse `/id/data?cid=196&tab=standings` sidebar links; 283 competitions verified; fields: cid, name, logo, href; name = id-locale)
  - GET /api/league/:cid/teams   (standings HTML link parse)
  - GET /api/team/:id/squad      (member_v2)
  - GET /api/player/:id          (person/detail full)
  - GET /api/league/:cid/players (aggregate: teams -> squads -> details; cached)
- Cache: in-memory Map w/ TTL. Defaults: teams 1h, squad 1h, player 6h, aggregate 6h. `CACHE_TTL_MS` env overrides all.
- Politeness: shared fetch wrapper — UA header, 15s timeout, 3 retries w/ exponential backoff, min 500ms spacing; aggregate fetch bounded concurrency 3.
- Port: env `PORT` default 3000. Error shape: `{error: true, message, status}`.
- Coaches excluded from aggregate players; squad endpoint returns raw groups (coaches included as their own group).
- Test strategy: tests-after; agent-executed QA = boot server, curl each endpoint, assert fields/counts vs live API, happy + failure (unknown player id, bad cid, upstream 429/5xx retry path).

## Open fork
None remaining (CSV fork moot; Express adopted as ecosystem default; TTL/port env-configured).

## Components ledger
- C1 af-api: scraper lib (fetchers) + express routes + cache + politeness wrapper + QA. (single component)

import { Router } from 'express';
import { cacheGet, cacheSet } from './lib/cache.js';
import { UpstreamError } from './lib/fetcher.js';
import { mountDocs } from './lib/docs.js';

const SITE_BASE = 'https://www.allfootballapp.com';
const DATA_PAGE = (cid) => `${SITE_BASE}/id/data?cid=${cid}&tab=standings&expanded=1`;

function err(status, message) {
  return { error: true, message, status };
}

function isDigits(s) {
  return /^\d+$/.test(s);
}

// Links point back at *this* API, never at the upstream site. They depend on the
// request host, so they are injected per-request and never stored in the cache.
function baseUrl(req) {
  return `${req.protocol}://${req.get('host')}`;
}

function linkLeagues(req, leagues) {
  const base = baseUrl(req);
  return leagues.map((l) => ({ ...l, href: `${base}/api/league/${l.cid}/teams` }));
}

function linkTeams(req, teams) {
  const base = baseUrl(req);
  return teams.map((t) => ({ ...t, href: `${base}/api/team/${t.team_id}/squad` }));
}

function linkSquad(req, squad) {
  const base = baseUrl(req);
  return {
    ...squad,
    groups: squad.groups.map((g) => ({
      ...g,
      members: g.members.map((m) => ({
        ...m,
        href: m.person_id ? `${base}/api/player/${m.person_id}` : null,
      })),
    })),
  };
}

async function withCache(key, kind, producer) {
  const hit = cacheGet(key);
  if (hit !== undefined) return hit;
  const value = await producer();
  cacheSet(key, value, kind);
  return value;
}

export function createRouter({ scraper, parsers, fetchText, docs = false }) {
  const router = Router();

  if (docs) mountDocs(router);

  router.get('/health', (req, res) => {
    res.json({ ok: true, docs: Boolean(docs) });
  });

  router.get('/api/leagues', async (req, res, next) => {
    try {
      const leagues = await withCache('leagues', 'leagues', async () => {
        const html = await fetchText(DATA_PAGE(196));
        return parsers.parseLeagues(html);
      });
      res.json({ count: leagues.length, leagues: linkLeagues(req, leagues) });
    } catch (e) {
      next(e);
    }
  });

  router.get('/api/league/:cid/teams', async (req, res, next) => {
    try {
      const { cid } = req.params;
      if (!isDigits(cid)) return res.status(400).json(err(400, 'cid must be numeric'));
      const teams = await withCache(`teams:${cid}`, 'teams', async () => {
        const html = await fetchText(DATA_PAGE(cid));
        return parsers.parseTeams(html);
      });
      if (teams.length === 0) {
        return res.status(404).json(err(404, `No teams found for competition ${cid}`));
      }
      res.json({ count: teams.length, teams: linkTeams(req, teams) });
    } catch (e) {
      next(e);
    }
  });

  router.get('/api/team/:id/squad', async (req, res, next) => {
    try {
      const { id } = req.params;
      if (!isDigits(id)) return res.status(400).json(err(400, 'team id must be numeric'));
      const squad = await withCache(`squad:${id}`, 'squad', () => scraper.getSquad(id));
      res.json({ team_id: id, ...linkSquad(req, squad) });
    } catch (e) {
      next(e);
    }
  });

  router.get('/api/player/:id', async (req, res, next) => {
    try {
      const { id } = req.params;
      if (!isDigits(id)) return res.status(400).json(err(400, 'player id must be numeric'));
      const player = await withCache(`player:${id}`, 'player', () => scraper.getPlayer(id));
      res.json({ ...player, href: `${baseUrl(req)}/api/player/${id}` });
    } catch (e) {
      next(e);
    }
  });

  router.get('/api/league/:cid/players', async (req, res, next) => {
    try {
      const { cid } = req.params;
      if (!isDigits(cid)) return res.status(400).json(err(400, 'cid must be numeric'));
      const result = await withCache(`aggregate:${cid}`, 'aggregate', async () => {
        const html = await fetchText(DATA_PAGE(cid));
        const teams = parsers.parseTeams(html);
        if (teams.length === 0) throw new UpstreamError(`No teams found for competition ${cid}`, { status: 404 });

        const personIds = new Set();
        for (const team of teams) {
          const squad = await scraper.getSquad(team.team_id);
          for (const group of squad.groups) {
            if (group.type === 'coach') continue;
            for (const member of group.members) {
              if (member.person_id) personIds.add(member.person_id);
            }
          }
        }

        const players = [];
        const errors = [];
        const ids = [...personIds];
        let done = 0;
        for (const personId of ids) {
          try {
            players.push(await scraper.getPlayer(personId));
          } catch (e) {
            errors.push({ person_id: personId, message: e.message });
          }
          done++;
          if (done % 25 === 0) console.log(`aggregate ${cid}: ${done}/${ids.length}`);
        }
        return { cid, team_count: teams.length, player_count: players.length, players, errors };
      });
      const base = baseUrl(req);
      res.json({
        ...result,
        players: result.players.map((p) => ({ ...p, href: `${base}/api/player/${p.person_id}` })),
      });
    } catch (e) {
      next(e);
    }
  });

  router.use((req, res) => {
    res.status(404).json(err(404, `Not found: ${req.method} ${req.path}`));
  });

  return router;
}

export function errorMiddleware(errValue, req, res, _next) {
  if (errValue instanceof Error) {
    const status = errValue.status ?? 500;
    const message = status === 500 ? 'Internal server error' : errValue.message;
    res.status(status).json(err(status, message));
    return;
  }
  res.status(500).json(err(500, 'Internal server error'));
}

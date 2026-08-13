import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { createRouter, errorMiddleware } from '../src/routes.js';
import { cacheClear } from '../src/lib/cache.js';
import { UpstreamError } from '../src/lib/fetcher.js';

const stubPlayer = {
  person_id: '50410856',
  name: 'Javairô Dilrosun',
  market_value_eur: 1000000,
};

function buildServer({ scraper, parsers, fetchText, docs } = {}) {
  const app = express();
  const deps = {
    scraper: scraper ?? { getSquad: async () => ({ count: 0, groups: [] }), getPlayer: async () => stubPlayer },
    parsers: parsers ?? { parseLeagues: () => [{ cid: '196', name: 'Qatar - Liga Utama', logo: null }], parseTeams: () => [{ team_id: '2891', name: 'Al-Sadd', slug: 'al-sadd', logo: null }] },
    fetchText: fetchText ?? (async () => '<html/>'),
    docs,
  };
  app.use(createRouter(deps));
  app.use(errorMiddleware);
  return new Promise((resolve) => {
    const server = app.listen(0, '127.0.0.1', () => resolve(server));
  });
}

async function get(server, path) {
  const { port } = server.address();
  const res = await fetch(`http://127.0.0.1:${port}${path}`);
  const body = await res.json().catch(() => null);
  return { status: res.status, body };
}

let server;

beforeEach(async () => {
  cacheClear();
  server = await buildServer();
});

afterEach(() => {
  server.close();
});

test('GET /health returns {ok:true} and reports the docs toggle', async () => {
  const { status, body } = await get(server, '/health');
  assert.equal(status, 200);
  assert.deepEqual(body, { ok: true, docs: false });
});

test('GET /api/leagues returns count + list from parser', async () => {
  const { status, body } = await get(server, '/api/leagues');
  assert.equal(status, 200);
  assert.equal(body.count, 1);
  assert.equal(body.leagues[0].cid, '196');
});

test('GET /api/league/:cid/teams happy path', async () => {
  const { status, body } = await get(server, '/api/league/196/teams');
  assert.equal(status, 200);
  assert.equal(body.count, 1);
  assert.equal(body.teams[0].team_id, '2891');
});

test('GET /api/league/abc/teams -> 400', async () => {
  const { status, body } = await get(server, '/api/league/abc/teams');
  assert.equal(status, 400);
  assert.equal(body.error, true);
});

test('GET /api/league/999/teams with parser yielding [] -> 404 error shape', async () => {
  server.close();
  server = await buildServer({ parsers: { parseLeagues: () => [], parseTeams: () => [] } });
  const { status, body } = await get(server, '/api/league/999/teams');
  assert.equal(status, 404);
  assert.equal(body.error, true);
  assert.equal(body.status, 404);
});

test('GET /api/team/:id/squad happy path', async () => {
  const { status, body } = await get(server, '/api/team/2891/squad');
  assert.equal(status, 200);
  assert.equal(body.team_id, '2891');
  assert.ok(Array.isArray(body.groups));
});

test('GET /api/player/:id happy path returns normalized player', async () => {
  const { status, body } = await get(server, '/api/player/50410856');
  assert.equal(status, 200);
  assert.equal(body.person_id, '50410856');
  assert.equal(body.market_value_eur, 1000000);
});

test('GET /api/player/:id UpstreamError(404) -> 404 JSON, no stack', async () => {
  server.close();
  server = await buildServer({
    scraper: {
      getSquad: async () => ({ count: 0, groups: [] }),
      getPlayer: async () => { throw new UpstreamError('Player not found (no base_info)', { status: 404 }); },
    },
  });
  const { status, body } = await get(server, '/api/player/999999999');
  assert.equal(status, 404);
  assert.equal(body.error, true);
  assert.ok(!body.stack, 'stack must not leak');
});

test('GET /api/player/:id generic error -> 500 JSON', async () => {
  server.close();
  server = await buildServer({
    scraper: {
      getSquad: async () => ({ count: 0, groups: [] }),
      getPlayer: async () => { throw new Error('totally broken'); },
    },
  });
  const { status, body } = await get(server, '/api/player/1');
  assert.equal(status, 500);
  assert.equal(body.error, true);
  assert.equal(body.message, 'Internal server error');
});

test('GET /api/league/:cid/players aggregates players, skips coaches, captures errors', async () => {
  server.close();
  const scraper = {
    getSquad: async () => ({
      count: 3,
      groups: [
        { type: 'coach', members: [{ person_id: '9001' }] },
        { type: 'goalkeeper', members: [{ person_id: 'p1' }] },
        { type: 'attacker', members: [{ person_id: 'p2' }, { person_id: 'p2' }] },
      ],
    }),
    getPlayer: async (id) => {
      if (id === 'p2') throw new UpstreamError('Player not found (no base_info)', { status: 404 });
      return { person_id: id };
    },
  };
  server = await buildServer({ scraper });
  const { status, body } = await get(server, '/api/league/196/players');
  assert.equal(status, 200);
  assert.equal(body.team_count, 1);
  assert.equal(body.player_count, 1, 'only p1 should succeed; coach skipped; p2 deduped fails once');
  assert.equal(body.players[0].person_id, 'p1');
  assert.equal(body.errors.length, 1);
  assert.equal(body.errors[0].person_id, 'p2');
});

test('responses link to this API, not to the upstream site', async () => {
  const { port } = server.address();
  const base = `http://127.0.0.1:${port}`;

  const leagues = await get(server, '/api/leagues');
  assert.equal(leagues.body.leagues[0].href, `${base}/api/league/196/teams`);

  const teams = await get(server, '/api/league/196/teams');
  assert.equal(teams.body.teams[0].href, `${base}/api/team/2891/squad`);

  const player = await get(server, '/api/player/50410856');
  assert.equal(player.body.href, `${base}/api/player/50410856`);
});

test('squad members link to their player route; null person_id -> null href', async () => {
  server.close();
  server = await buildServer({
    scraper: {
      getSquad: async () => ({
        count: 2,
        groups: [{ type: 'attacker', members: [{ person_id: '50205787' }, { person_id: null }] }],
      }),
      getPlayer: async () => stubPlayer,
    },
  });
  const { port } = server.address();
  const { body } = await get(server, '/api/team/2891/squad');
  const [withId, withoutId] = body.groups[0].members;
  assert.equal(withId.href, `http://127.0.0.1:${port}/api/player/50205787`);
  assert.equal(withoutId.href, null);
});

test('cached responses re-link per request host', async () => {
  // Warm the cache through one host, then read it back through another: the
  // cached value must not carry the first request's host.
  const { port } = server.address();
  await get(server, '/api/leagues');
  const res = await fetch(`http://localhost:${port}/api/leagues`);
  const body = await res.json();
  assert.equal(body.leagues[0].href, `http://localhost:${port}/api/league/196/teams`);
});

test('unknown route -> 404 JSON', async () => {
  const { status, body } = await get(server, '/nope');
  assert.equal(status, 404);
  assert.equal(body.error, true);
});

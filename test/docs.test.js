import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { createRouter, errorMiddleware } from '../src/routes.js';
import { docsEnabled } from '../src/lib/docs.js';

const deps = {
  scraper: { getSquad: async () => ({ count: 0, groups: [] }), getPlayer: async () => ({ person_id: '1' }) },
  parsers: { parseLeagues: () => [], parseTeams: () => [] },
  fetchText: async () => '<html/>',
};

function buildServer(docs) {
  const app = express();
  app.use(createRouter({ ...deps, docs }));
  app.use(errorMiddleware);
  return new Promise((resolve) => {
    const server = app.listen(0, '127.0.0.1', () => resolve(server));
  });
}

const servers = [];
async function serverWith(docs) {
  const s = await buildServer(docs);
  servers.push(s);
  return `http://127.0.0.1:${s.address().port}`;
}

after(() => servers.forEach((s) => s.close()));

test('docsEnabled: on by default, off only for explicit falsey values', () => {
  assert.equal(docsEnabled({}), true);
  assert.equal(docsEnabled({ DOCS_ENABLED: '' }), true);
  assert.equal(docsEnabled({ DOCS_ENABLED: 'true' }), true);
  assert.equal(docsEnabled({ DOCS_ENABLED: '1' }), true);
  for (const v of ['false', 'FALSE', '0', 'off', 'no', ' false ']) {
    assert.equal(docsEnabled({ DOCS_ENABLED: v }), false, `${v} should disable docs`);
  }
});

test('docs enabled: /docs serves our Swagger UI page, not the packaged petstore one', async () => {
  const base = await serverWith(true);
  const res = await fetch(`${base}/docs`);
  const html = await res.text();
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type'), /text\/html/);
  assert.match(html, /af-api reference/);
  assert.match(html, /url: '\/openapi\.yaml'/);
  assert.ok(!html.includes('petstore'), 'must not serve swagger-ui-dist index.html');
});

test('docs enabled: UI assets are served locally, no CDN needed', async () => {
  const base = await serverWith(true);
  for (const asset of ['/docs/swagger-ui.css', '/docs/swagger-ui-bundle.js']) {
    const res = await fetch(`${base}${asset}`);
    assert.equal(res.status, 200, `${asset} should be served`);
  }
});

test('docs enabled: spec and prose reference are downloadable', async () => {
  const base = await serverWith(true);

  const spec = await fetch(`${base}/openapi.yaml`);
  const yaml = await spec.text();
  assert.equal(spec.status, 200);
  assert.match(spec.headers.get('content-type'), /yaml/);
  assert.match(yaml, /^openapi: 3\.1\.0/);
  assert.match(yaml, /\/api\/team\/\{id\}\/squad:/);

  const md = await fetch(`${base}/docs/reference.md`);
  assert.equal(md.status, 200);
  assert.match(md.headers.get('content-type'), /markdown/);
  assert.match(await md.text(), /# af-api/);
});

test('docs disabled: every docs path 404s with the API error shape', async () => {
  const base = await serverWith(false);
  for (const path of ['/docs', '/docs/', '/openapi.yaml', '/docs/reference.md', '/docs/swagger-ui.css']) {
    const res = await fetch(`${base}${path}`);
    assert.equal(res.status, 404, `${path} should 404 when docs are off`);
    const body = await res.json();
    assert.equal(body.error, true);
  }
});

test('docs toggle is reported by /health', async () => {
  const on = await fetch(`${await serverWith(true)}/health`).then((r) => r.json());
  const off = await fetch(`${await serverWith(false)}/health`).then((r) => r.json());
  assert.deepEqual(on, { ok: true, docs: true });
  assert.deepEqual(off, { ok: true, docs: false });
});

test('docs never shadow the API routes', async () => {
  const base = await serverWith(true);
  const res = await fetch(`${base}/api/player/50410856`);
  assert.equal(res.status, 200);
  assert.equal((await res.json()).person_id, '1');
});

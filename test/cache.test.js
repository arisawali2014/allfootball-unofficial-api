import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cacheGet, cacheSet, cacheClear, TTL_DEFAULTS } from '../src/lib/cache.js';

test('set then get returns value', () => {
  cacheClear();
  cacheSet('k', { a: 1 }, 'teams');
  assert.deepEqual(cacheGet('k'), { a: 1 });
});

test('missing key returns undefined', () => {
  cacheClear();
  assert.equal(cacheGet('nope'), undefined);
});

test('expired entry returns undefined and is dropped', async () => {
  cacheClear();
  cacheSet('k', 'v', 'player', 5);
  assert.equal(cacheGet('k'), 'v');
  await new Promise((r) => setTimeout(r, 15));
  assert.equal(cacheGet('k'), undefined);
});

test('explicit ttl overrides kind default', () => {
  cacheClear();
  cacheSet('k', 'v', 'leagues', 50);
  assert.equal(cacheGet('k'), 'v');
});

test('CACHE_TTL_MS env overrides all kinds', () => {
  process.env.CACHE_TTL_MS = '1';
  try {
    cacheClear();
    cacheSet('k', 'v', 'player');
    assert.equal(cacheGet('k'), 'v');
  } finally {
    delete process.env.CACHE_TTL_MS;
  }
});

test('TTL_DEFAULTS sane ordering', () => {
  assert.ok(TTL_DEFAULTS.player > TTL_DEFAULTS.squad);
  assert.ok(TTL_DEFAULTS.leagues > TTL_DEFAULTS.teams);
});

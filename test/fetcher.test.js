import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { fetchJson, fetchText, UpstreamError } from '../src/lib/fetcher.js';

async function mockServer(handler) {
  const server = createServer(handler);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  return { server, url: (path) => `http://127.0.0.1:${port}${path}` };
}

test('fetchJson: 200 parses JSON object', async () => {
  const { server, url } = await mockServer((req, res) => {
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ hello: 'world', n: 42 }));
  });
  try {
    const out = await fetchJson(url('/x'), { minSpacingMs: 0, maxRetries: 0, timeoutMs: 5000 });
    assert.deepEqual(out, { hello: 'world', n: 42 });
  } finally {
    server.close();
  }
});

test('fetchText: 200 returns raw string', async () => {
  const { server, url } = await mockServer((req, res) => res.end('<html>hi</html>'));
  try {
    const out = await fetchText(url('/x'), { minSpacingMs: 0, maxRetries: 0, timeoutMs: 5000 });
    assert.equal(out, '<html>hi</html>');
  } finally {
    server.close();
  }
});

test('fetchJson: 404 throws UpstreamError with status 404 (no retry on non-retryable 4xx)', async () => {
  let hits = 0;
  const { server, url } = await mockServer((req, res) => {
    hits++;
    res.statusCode = 404;
    res.end('{}');
  });
  try {
    await assert.rejects(fetchJson(url('/nope'), { minSpacingMs: 0, maxRetries: 3, timeoutMs: 5000 }), (err) => {
      assert.ok(err instanceof UpstreamError);
      assert.equal(err.status, 404);
      return true;
    });
    assert.equal(hits, 1, '404 must not be retried');
  } finally {
    server.close();
  }
});

test('fetchJson: 429 then 200 retries and succeeds', async () => {
  let hits = 0;
  const { server, url } = await mockServer((req, res) => {
    hits++;
    if (hits === 1) {
      res.statusCode = 429;
      res.end('slow down');
      return;
    }
    res.setHeader('content-type', 'application/json');
    res.end('{"ok":true}');
  });
  try {
    const out = await fetchJson(url('/retry'), { minSpacingMs: 0, maxRetries: 3, retryBackoffMs: [5, 5, 5], timeoutMs: 5000 });
    assert.deepEqual(out, { ok: true });
    assert.equal(hits, 2);
  } finally {
    server.close();
  }
});

test('fetchJson: 5xx retried maxRetries+1 times then throws 502', async () => {
  let hits = 0;
  const { server, url } = await mockServer((req, res) => {
    hits++;
    res.statusCode = 500;
    res.end('boom');
  });
  try {
    await assert.rejects(fetchJson(url('/fail'), { minSpacingMs: 0, maxRetries: 2, retryBackoffMs: [5, 5], timeoutMs: 5000 }), (err) => {
      assert.ok(err instanceof UpstreamError);
      assert.equal(err.status, 502);
      return true;
    });
    assert.equal(hits, 3);
  } finally {
    server.close();
  }
});

test('fetchJson: timeout throws UpstreamError 504', async () => {
  const { server, url } = await mockServer((req, res) => {
    // never respond; let AbortSignal.timeout fire
    setTimeout(() => {}, 1000);
  });
  try {
    await assert.rejects(fetchJson(url('/slow'), { minSpacingMs: 0, maxRetries: 0, timeoutMs: 50 }), (err) => {
      assert.ok(err instanceof UpstreamError);
      assert.equal(err.status, 504);
      return true;
    });
  } finally {
    server.close();
  }
});

test('fetchJson: invalid JSON body on 200 throws UpstreamError 502', async () => {
  const { server, url } = await mockServer((req, res) => {
    res.setHeader('content-type', 'application/json');
    res.end('not json at all');
  });
  try {
    await assert.rejects(fetchJson(url('/badjson'), { minSpacingMs: 0, maxRetries: 0, timeoutMs: 5000 }), (err) => {
      assert.ok(err instanceof UpstreamError);
      assert.equal(err.status, 502);
      return true;
    });
  } finally {
    server.close();
  }
});

test('spacing: two requests start >= minSpacingMs apart', async () => {
  const { server, url } = await mockServer((req, res) => res.end('{}'));
  try {
    const t0 = Date.now();
    await fetchJson(url('/a'), { minSpacingMs: 80, maxRetries: 0, timeoutMs: 5000 });
    await fetchJson(url('/b'), { minSpacingMs: 80, maxRetries: 0, timeoutMs: 5000 });
    const elapsed = Date.now() - t0;
    assert.ok(elapsed >= 80, `expected >=80ms between starts, got ${elapsed}ms`);
  } finally {
    server.close();
  }
});

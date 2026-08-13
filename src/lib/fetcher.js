// Polite HTTP wrapper around built-in fetch for allfootballapp.com upstream calls.
// Global guarantees: min spacing between request starts, bounded concurrency,
// timeout, retry with backoff on 429/5xx/network errors.

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) af-api/1.0';

export class UpstreamError extends Error {
  constructor(message, { status = 502, url = '' } = {}) {
    super(message);
    this.name = 'UpstreamError';
    this.status = status;
    this.url = url;
  }
}

// --- concurrency limiter (hand-rolled semaphore, no deps) ---
class Semaphore {
  constructor(max) {
    this.max = max;
    this.active = 0;
    this.waiters = [];
  }
  async acquire() {
    if (this.active < this.max) {
      this.active++;
      return;
    }
    await new Promise((resolve) => this.waiters.push(resolve));
    this.active++;
  }
  release() {
    this.active--;
    const next = this.waiters.shift();
    if (next) next();
  }
}

const limiter = new Semaphore(3);

// --- global spacing gate (applies across ALL callers) ---
let lastRequestStart = 0;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForSpacing(minSpacingMs) {
  const now = Date.now();
  const wait = lastRequestStart + minSpacingMs - now;
  if (wait > 0) await sleep(wait);
  lastRequestStart = Date.now();
}

const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504]);

async function rawRequest(url, { timeoutMs, headers, maxRetries, retryBackoffMs }) {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    let res;
    try {
      res = await fetch(url, {
        headers,
        signal: AbortSignal.timeout(timeoutMs),
        redirect: 'follow',
      });
    } catch (err) {
      if (attempt < maxRetries) {
        await sleep(retryBackoffMs[attempt]);
        continue;
      }
      const isTimeout = err && (err.name === 'TimeoutError' || err.name === 'AbortError');
      throw new UpstreamError(
        isTimeout ? `Upstream timeout after ${timeoutMs}ms: ${url}` : `Upstream network error: ${err.message}`,
        { status: isTimeout ? 504 : 502, url }
      );
    }
    if (res.ok) return res;
    if (!RETRYABLE_STATUS.has(res.status)) {
      throw new UpstreamError(`Upstream responded ${res.status} for ${url}`, { status: res.status, url });
    }
    if (attempt < maxRetries) {
      await sleep(retryBackoffMs[attempt]);
      continue;
    }
    throw new UpstreamError(`Upstream responded ${res.status} after ${maxRetries + 1} attempts: ${url}`, {
      status: 502,
      url,
    });
  }
  // unreachable
  throw new UpstreamError(`Request failed: ${url}`, { status: 502, url });
}

const DEFAULTS = {
  minSpacingMs: 500,
  timeoutMs: 15000,
  maxRetries: 3,
  retryBackoffMs: [1000, 3000, 9000],
};

async function request(url, { mode = 'json', ...overrides } = {}) {
  const opts = { ...DEFAULTS, ...overrides };
  await waitForSpacing(opts.minSpacingMs);
  await limiter.acquire();
  try {
    const headers = {
      'User-Agent': USER_AGENT,
      Accept: mode === 'json' ? 'application/json' : 'text/html,application/xhtml+xml',
    };
    const res = await rawRequest(url, {
      timeoutMs: opts.timeoutMs,
      headers,
      maxRetries: opts.maxRetries,
      retryBackoffMs: opts.retryBackoffMs,
    });
    if (mode === 'json') {
      try {
        return await res.json();
      } catch (err) {
        throw new UpstreamError(`Upstream returned non-JSON for ${url}`, { status: 502, url });
      }
    }
    return await res.text();
  } finally {
    limiter.release();
  }
}

export function fetchJson(url, opts) {
  return request(url, { mode: 'json', ...opts });
}

export function fetchText(url, opts) {
  return request(url, { mode: 'text', ...opts });
}

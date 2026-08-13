// Minimal in-memory TTL cache. Lazy expiry: expired entries are dropped on read.

const HOUR = 3600_000;

export const TTL_DEFAULTS = {
  leagues: 24 * HOUR,
  teams: HOUR,
  squad: HOUR,
  player: 6 * HOUR,
  aggregate: 6 * HOUR,
};

const store = new Map(); // key -> { expires, value }

function ttlFor(kind) {
  const env = Number(process.env.CACHE_TTL_MS);
  if (Number.isFinite(env) && env > 0) return env;
  return TTL_DEFAULTS[kind] ?? HOUR;
}

export function cacheGet(key) {
  const entry = store.get(key);
  if (!entry) return undefined;
  if (entry.expires < Date.now()) {
    store.delete(key);
    return undefined;
  }
  return entry.value;
}

export function cacheSet(key, value, kind, ttlMs = ttlFor(kind)) {
  store.set(key, { expires: Date.now() + ttlMs, value });
}

export function cacheClear() {
  store.clear();
}

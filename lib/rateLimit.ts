/**
 * In-memory rate limit for ingest: by IP or by API key.
 * INGEST_RATE_LIMIT_PER_MIN = max requests per minute per key (default 120).
 */
const LIMIT_PER_MIN = Number(process.env.INGEST_RATE_LIMIT_PER_MIN) || 120;
const WINDOW_MS = 60 * 1000;

// key -> timestamps of requests in current window
const hits = new Map<string, number[]>();

function prune(key: string): void {
  const now = Date.now();
  const list = hits.get(key) ?? [];
  const kept = list.filter((t) => now - t < WINDOW_MS);
  if (kept.length === 0) hits.delete(key);
  else hits.set(key, kept);
}

/** Returns true if the request is within limit, false if rate limited. */
export function checkRateLimit(key: string): boolean {
  prune(key);
  const list = hits.get(key) ?? [];
  if (list.length >= LIMIT_PER_MIN) return false;
  list.push(Date.now());
  hits.set(key, list);
  return true;
}

export function getLimitPerMin(): number {
  return LIMIT_PER_MIN;
}

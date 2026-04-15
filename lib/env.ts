/**
 * Safe startup diagnostics for production deployments (no secrets logged).
 */
export function logProductionEnvHints(): void {
  if (process.env.NODE_ENV !== 'production') return;

  const key = process.env.INGEST_API_KEY;
  if (key && key.length < 16) {
    console.warn(
      '[env] INGEST_API_KEY is shorter than 16 characters — use a longer random secret in production.'
    );
  }

  if (!process.env.INGEST_API_KEY) {
    console.warn('[env] INGEST_API_KEY is unset — ingest is open to any client (rate limited by IP only).');
  }
}

# Changelog

## [2.0.0] – 2026-04-15

### Ten major upgrades

1. **API versioning** – Stable ingest at `POST /api/v1/ingest` (same behavior as `/api/ingest`) for integrators who pin a versioned path.
2. **Zod-backed validation** – Ingest payloads are validated with shared schemas (`lib/ingest-schema.ts`) for clearer, consistent errors and easier evolution.
3. **Central ingest handler** – `lib/ingest-handler.ts` owns idempotency, rate limiting, validation, persistence, webhooks; both ingest routes stay thin.
4. **Health & version endpoints** – `GET /api/health` and `GET /api/version` for load balancers, k8s probes, and deployment visibility.
5. **Environment diagnostics** – `lib/env.ts` logs safe production hints (e.g. short API keys) without exposing secrets.
6. **Security HTTP headers** – `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`, and `Permissions-Policy` on all routes via `next.config.js`.
7. **Docker production image** – Multi-stage `Dockerfile` with Next `output: 'standalone'` plus `docker-compose.yml` for one-command runs.
8. **GitHub Actions CI** – Lint, build, and Vitest on every push and pull request.
9. **Automated tests** – Vitest + Node environment covering ingest schema validation (`lib/ingest-schema.test.ts`).
10. **Shareable dashboard URLs** – Tab state syncs to `?tab=overview|alerts|watchlist|events|export` for bookmarks and support links.

### Changed

- `package.json` version set to **2.0.0**; `npm test` runs Vitest.
- README documents v2 endpoints, Docker, and CI.

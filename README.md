# Casino Fraud & Cheating Tracker

**Repository:** [github.com/g8tsz/Casino-Fruad-Cheating-tracker-](https://github.com/g8tsz/Casino-Fruad-Cheating-tracker-) (note: repo name has typo “Fruad”; correct spelling is “Fraud”. Clone URL unchanged.)

Track **fraud and cheating** for **online and land-based** casinos: odd win %, bad requests, RTP/slot tampering, collusion, capping, chip passing, rate abuse, repeated-bet bots, impossible win sequences, session/time-of-day anomalies, and multi-account (IP/device). Works with **live data** from most website casinos via a simple ingest API.

---

## Features

- **Odd percentage** – Flags suspicious win rates (e.g. >65% over a session), including **per-player** attribution.
- **Bad requests** – Tracks 4xx/5xx and request patterns (probes, abuse).
- **Slot / meter tampering** – Alerts when RTP or hold % is outside allowed range.
- **Collusion & card-counting** – Watch list + same-table/correlated activity signals.
- **Capping & chip passing** – Large chip moves between players, add-on bet patterns.
- **Rate abuse** – High request rate per session (bots, scraping).
- **Repeated bet (bot)** – Same bet amount repeated many times in a session.
- **Impossible win sequence** – Wins without prior bets (data tampering or ingest error).
- **Session length / time-of-day anomalies** – Unusual session duration or activity concentration.
- **Multi-account (IP / device)** – Same IP or `deviceId` used by many players.
- **Watch list** – Players, tables, sessions, IPs to flag for collusion/behavior review.
- **Live data** – POST events to `/api/ingest`; optional `ip` and `deviceId` for geo/device rules.
- **Dashboard** – Overview (stats, alerts by type, alerts over time, top flagged players/tables), Alerts and Events with date range and “Last hour” filter, Export (JSON + CSV, daily digest), Config with **threshold presets** (strict / normal / lenient).
- **Ingest** – Optional auth; **Idempotency-Key** header to dedupe; **rate limit** per IP or API key; **validation** with clear error messages; **webhook** on high/critical alerts.
- **Retention** – Configurable retention for events and alerts; cleanup runs on ingest.
- **Audit log** – Watch list and config changes (GET `/api/audit`).

---

## Quick start

```bash
git clone https://github.com/g8tsz/Casino-Fruad-Cheating-tracker-.git
cd Casino-Fruad-Cheating-tracker-
npm install
npm run dev
```

Open **http://localhost:3001**. Use mock data by sending events to the ingest endpoint (see below).

---

## Development

- **Lint:** `npm run lint`
- **Build:** `npm run build`
- **Start (prod):** `npm start` (port 3001)

Env vars are documented in **Config** below. Copy `.env.example` to `.env` and set as needed.

---

## Ingest API (for website casinos)

**POST /api/ingest**

- Optional auth: `Authorization: Bearer <key>` or `X-API-Key: <key>` when `INGEST_API_KEY` is set.
- **Idempotency-Key:** Send a unique key (e.g. UUID) to dedupe retries; same key returns cached response.
- **Rate limit:** Per IP or per API key (default 120/min; `INGEST_RATE_LIMIT_PER_MIN`).
- **Validation:** Invalid payloads return 400 with `message`, `field`, `index`, and `details`.

Body: `{ "events": [ ... ] }` or `[ ... ]`. Events may include **ip** and **deviceId** for multi-account detection.

| type | Optional fields |
|------|------------------|
| `bet` | playerId, sessionId, gameId, tableId, amount, ip, deviceId |
| `win` | playerId, sessionId, gameId, amount, expectedRtp, ip, deviceId |
| `request` | sessionId, path, method, statusCode, responseTimeMs |
| `session_start` / `session_end` | playerId, sessionId |
| `chip_move` | fromPlayerId, toPlayerId, amount, tableId |

All events need **timestamp** (ISO string). On high/critical alert, optional **WEBHOOK_URL** is POSTed a summary.

---

## Dashboard

- **Overview** – Stats range 1h / 24h / 7d / 30d; alerts by type; alerts over time (line chart); top flagged players and tables.
- **Alerts** – Date range (from/to), “Last hour” quick filter, type/severity/unack only, search.
- **Events** – Date range, “Last hour”, type filter, search.
- **Export & config** – Download JSON or CSV; daily digest (GET `/api/export/digest?date=YYYY-MM-DD`); view config and **preset** (strict / normal / lenient).

---

## API summary

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/ingest` | POST | Send events. Optional: Idempotency-Key, Bearer/X-API-Key. Rate limited. |
| `/api/alerts` | GET | List alerts. Query: limit, type, severity, playerId, acknowledged, from, to. |
| `/api/alerts` | PATCH | Acknowledge alert (body: `{ id }`). |
| `/api/watchlist` | GET / POST | List or add watch list entry (kind, value, reason). |
| `/api/stats` | GET | Fraud stats. Query: range (1h, 24h, 7d, 30d). |
| `/api/events` | GET | Recent events. Query: limit, type, playerId, sessionId, from, to. |
| `/api/export` | GET | Download JSON or CSV. Query: alerts, events, format=json\|csv. |
| `/api/export/digest` | GET | Daily digest. Query: date=YYYY-MM-DD. |
| `/api/config` | GET | Thresholds and preset (mask=false to see values). |
| `/api/audit` | GET | Audit log (watch list/config changes). Query: limit. |

---

## Config (optional)

| Env | Description |
|-----|-------------|
| `THRESHOLD_PRESET` | `strict` \| `normal` \| `lenient` (default `normal`) |
| `DATA_SOURCE` | `memory` (default) or `api` |
| `LIVE_API_BASE_URL` | Your API base when `DATA_SOURCE=api` |
| `LIVE_API_KEY` | Bearer token for your API |
| `INGEST_API_KEY` | If set, POST /api/ingest requires Bearer or X-API-Key |
| `INGEST_RATE_LIMIT_PER_MIN` | Max ingest requests per minute per IP/key (default 120) |
| `WEBHOOK_URL` | POST summary when high/critical alert fires |
| `RTP_MIN_PCT` / `RTP_MAX_PCT` | Allowed RTP range (preset overrides) |
| `WIN_RATE_SUSPICIOUS_PCT` | Win rate above this triggers odd % alert |
| `RATE_ABUSE_PER_MIN` | Requests per minute to flag rate abuse |
| `ALERT_COOLDOWN_MS` | Cooldown same alert type+entity (default 10 min) |
| `REPEATED_BET_COUNT_THRESHOLD` | Same bet amount repeated this many times → bot alert |
| `SESSION_LENGTH_MAX_HOURS` | Session longer than this → session length anomaly |
| `PLAYERS_PER_IP_THRESHOLD` | Distinct players per IP to flag multi-account |
| `PLAYERS_PER_DEVICE_THRESHOLD` | Distinct players per deviceId to flag multi-account |
| `EVENTS_RETENTION_DAYS` | Delete events older than this (default 7) |
| `ALERTS_RETENTION_DAYS` | Delete alerts older than this (default 30) |

---

## Tech

Next.js 14, TypeScript, Tailwind, Recharts. No database required for default mode (in-memory store with optional retention).

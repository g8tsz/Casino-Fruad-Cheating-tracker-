# Casino Fraud & Cheating Tracker

**Repository:** [github.com/g8tsz/Casino-Fruad-Cheating-tracker-](https://github.com/g8tsz/Casino-Fruad-Cheating-tracker-)

Track **fraud and cheating** for **online and land-based** casinos: odd win %, bad requests, RTP/slot tampering, collusion, capping, chip passing, and rate abuse. Works with **live data** from most website casinos via a simple ingest API.

---

## Features

- **Odd percentage** – Flags suspicious win rates (e.g. >65% over a session), including **per-player** attribution.
- **Bad requests** – Tracks 4xx/5xx and request patterns (probes, abuse).
- **Slot / meter tampering** – Alerts when RTP or hold % is outside allowed range.
- **Collusion & card-counting** – Watch list + same-table/correlated activity signals.
- **Capping & chip passing** – Large chip moves between players, add-on bet patterns.
- **Rate abuse** – High request rate per session (bots, scraping).
- **Watch list** – Players, tables, sessions to flag for collusion/behavior review.
- **Live data** – POST events to `/api/ingest`; works with any platform that can send JSON.
- **Dashboard** – Tabs: Overview (stats + chart), Alerts (filters, search, ack), Watch list, Events (filters), Export & config. Stats time range: 24h / 7d / 30d. Export alerts and events as JSON.
- **Optional ingest auth** – Set `INGEST_API_KEY` to require `Authorization: Bearer <key>` or `X-API-Key: <key>` on ingest.
- **Alert cooldown** – Same alert type for the same player/session is throttled (default 10 min) to reduce noise.

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

## Ingest API (for website casinos)

Send events from your casino site to trigger detection. Works with **most website casinos** that can send HTTP POST with JSON.

**POST /api/ingest**

Optional auth (if `INGEST_API_KEY` is set): `Authorization: Bearer <key>` or `X-API-Key: <key>`.

Body (either format):

```json
{ "events": [ { "type": "bet", "playerId": "P1", "sessionId": "S1", "amount": 100, "timestamp": "2025-03-02T12:00:00Z" } ] }
```

or

```json
[
  { "type": "win", "playerId": "P1", "gameId": "slot-1", "amount": 150, "expectedRtp": 96, "timestamp": "2025-03-02T12:01:00Z" },
  { "type": "request", "sessionId": "S1", "path": "/api/spin", "statusCode": 401, "timestamp": "2025-03-02T12:00:00Z" }
]
```

**Event types**

| type | Use | Optional fields |
|------|-----|------------------|
| `bet` | Bet placed | playerId, sessionId, gameId, tableId, amount |
| `win` | Win paid | playerId, sessionId, gameId, amount, **expectedRtp** (for RTP checks) |
| `request` | HTTP request (online) | sessionId, path, method, **statusCode**, responseTimeMs |
| `session_start` / `session_end` | Session bounds | playerId, sessionId |
| `chip_move` | Chip transfer (live tables) | fromPlayerId, toPlayerId, amount, tableId |

All events need **timestamp** (ISO string). Detection runs on ingest; alerts appear on the dashboard.

---

## Dashboard

- **Overview** – Stats (alerts, bad request %, odd % count, watch list size), time range selector (24h / 7d / 30d), alerts-by-type chart.
- **Alerts** – List with filters (type, severity, unack only), search (title, player, session), acknowledge.
- **Watch list** – Add/remove players, tables, sessions.
- **Events** – Recent ingested events with type filter and search.
- **Export & config** – Download alerts and events as JSON; view config (env indicators, masked).

---

## API summary

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/ingest` | POST | Send events (body: `{ events: [...] }` or `[...]`). Optional: `Authorization: Bearer <key>` or `X-API-Key` if `INGEST_API_KEY` set. |
| `/api/alerts` | GET | List alerts. Query: `limit`, `type`, `severity`, `playerId`, `acknowledged`, `from`, `to`. |
| `/api/alerts` | PATCH | Acknowledge alert (body: `{ id }`). |
| `/api/watchlist` | GET | List watch list. |
| `/api/watchlist` | POST | Add entry (body: `{ kind, value, reason }`). |
| `/api/stats` | GET | Fraud stats. Query: `range` (e.g. `24h`, `7d`, `30d`). |
| `/api/events` | GET | Recent events. Query: `limit`, `type`, `playerId`, `sessionId`, `from`, `to`. |
| `/api/export` | GET | Download JSON. Query: `alerts`, `events` (limits, 0 = skip). |
| `/api/config` | GET | Config indicators (masked) for dashboard. |

---

## Config (optional)

| Env | Description |
|-----|-------------|
| `DATA_SOURCE` | `memory` (default) or `api` |
| `LIVE_API_BASE_URL` | Your API base when `DATA_SOURCE=api` |
| `LIVE_API_KEY` | Bearer token for your API |
| `INGEST_API_KEY` | If set, POST /api/ingest requires this as Bearer or X-API-Key |
| `RTP_MIN_PCT` / `RTP_MAX_PCT` | Allowed RTP range (default 85–102%) |
| `WIN_RATE_SUSPICIOUS_PCT` | Win rate above this triggers odd % alert (default 65) |
| `BAD_REQUEST_RATE_THRESHOLD` | Bad-request ratio threshold (0–1) |
| `RATE_ABUSE_PER_MIN` | Requests per minute per session to flag (default 120) |
| `ALERT_COOLDOWN_MS` | Cooldown before re-raising same alert type for same entity (default 600000 = 10 min) |

---

## Tech

Next.js 14, TypeScript, Tailwind, Recharts. No database required for default mode.

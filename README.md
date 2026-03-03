# Casino Fraud & Cheating Tracker

**Repository:** [github.com/lorddummy/Casino-Fruad-Cheating-tracker-](https://github.com/lorddummy/Casino-Fruad-Cheating-tracker-)

Track **fraud and cheating** for **online and land-based** casinos: odd win %, bad requests, RTP/slot tampering, collusion, capping, chip passing, and rate abuse. Works with **live data** from most website casinos via a simple ingest API.

---

## Features

- **Odd percentage** – Flags suspicious win rates (e.g. >65% over a session).
- **Bad requests** – Tracks 4xx/5xx and request patterns (probes, abuse).
- **Slot / meter tampering** – Alerts when RTP or hold % is outside allowed range.
- **Collusion & card-counting** – Watch list + same-table/correlated activity signals.
- **Capping & chip passing** – Large chip moves between players, add-on bet patterns.
- **Rate abuse** – High request rate per session (bots, scraping).
- **Watch list** – Players, tables, sessions to flag for collusion/behavior review.
- **Live data** – POST events to `/api/ingest`; works with any platform that can send JSON.

---

## Quick start

```bash
git clone https://github.com/lorddummy/Casino-Fruad-Cheating-tracker-.git
cd Casino-Fruad-Cheating-tracker-
npm install
npm run dev
```

Open **http://localhost:3001**. Use mock data by sending events to the ingest endpoint (see below).

---

## Ingest API (for website casinos)

Send events from your casino site to trigger detection. Works with **most website casinos** that can send HTTP POST with JSON.

**POST /api/ingest**

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

- **Stats** – Alerts (24h), bad request rate %, odd % count, watch list size.
- **Alerts by type** – Bar chart (collusion, bad_request, odd_percentage, etc.).
- **Fraud alerts** – List with severity, suggested action, acknowledge.
- **Watch list** – Add/remove players, tables, sessions for collusion/behavior focus.
- **Recent events** – Last ingested events (type, player, status, time).

---

## Live data & scale

- **In-memory (default)** – No DB; ingest stores recent events and alerts in process. Good for demos and single-instance.
- **External API** – Set `DATA_SOURCE=api` and `LIVE_API_BASE_URL` to your backend; the app can POST alerts and ingest to your API for persistence and scaling.
- **Integrate with your site** – From your casino frontend or backend, POST to `https://your-tracker-host/api/ingest` with the same event shape. Works with **most website casinos** (any stack that can send JSON over HTTPS).

For **large-scale** deployment, run multiple instances behind a load balancer and use the external API mode to centralize alerts and events in your own store (DB, data lake).

---

## Config (optional)

| Env | Description |
|-----|-------------|
| `DATA_SOURCE` | `memory` (default) or `api` |
| `LIVE_API_BASE_URL` | Your API base when `DATA_SOURCE=api` |
| `LIVE_API_KEY` | Bearer token for your API |
| `RTP_MIN_PCT` / `RTP_MAX_PCT` | Allowed RTP range (default 85–102%) |
| `WIN_RATE_SUSPICIOUS_PCT` | Win rate above this triggers odd % alert (default 65) |
| `BAD_REQUEST_RATE_THRESHOLD` | Bad-request ratio threshold (0–1) |
| `RATE_ABUSE_PER_MIN` | Requests per minute per session to flag (default 120) |

---

## API summary

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/ingest` | POST | Send events (body: `{ events: [...] }` or `[...]`) |
| `/api/alerts` | GET | List fraud alerts |
| `/api/alerts` | PATCH | Acknowledge alert (body: `{ id }`) |
| `/api/watchlist` | GET | List watch list |
| `/api/watchlist` | POST | Add entry (body: `{ kind, value, reason }`) |
| `/api/stats` | GET | Fraud stats (counts, rates) |
| `/api/events` | GET | Recent ingested events |

---

## Tech

Next.js 14, TypeScript, Tailwind, Recharts. No database required for default mode.

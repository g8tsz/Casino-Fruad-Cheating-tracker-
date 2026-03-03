# Ingest API for website casinos

Your casino website (or backend) sends **events** to this tracker. The tracker runs fraud/cheating detection and shows alerts on the dashboard. Works with **most website casinos** that can send JSON over HTTPS.

## Endpoint

```
POST https://your-tracker-host/api/ingest
Content-Type: application/json
```

## Request body

Two forms accepted:

1. **Array of events**
```json
[
  { "type": "bet", "playerId": "usr_123", "sessionId": "sess_abc", "amount": 50, "timestamp": "2025-03-02T14:00:00.000Z" },
  { "type": "win", "playerId": "usr_123", "gameId": "slot_mega", "amount": 120, "expectedRtp": 96, "timestamp": "2025-03-02T14:00:05.000Z" }
]
```

2. **Object with `events` key**
```json
{
  "events": [
    { "type": "request", "sessionId": "sess_abc", "path": "/api/spin", "method": "POST", "statusCode": 200, "timestamp": "2025-03-02T14:00:00.000Z" }
  ]
}
```

## Event types and fields

| type | Description | Recommended fields |
|------|-------------|--------------------|
| `bet` | Player placed a bet | playerId, sessionId, gameId, tableId, amount, timestamp |
| `win` | Player won | playerId, sessionId, gameId, amount, expectedRtp (for slots), timestamp |
| `request` | HTTP request (online casinos) | sessionId, path, method, statusCode, responseTimeMs, timestamp |
| `session_start` | Session began | playerId, sessionId, timestamp |
| `session_end` | Session ended | playerId, sessionId, timestamp |
| `chip_move` | Chips moved between players (live tables) | fromPlayerId, toPlayerId, amount, tableId, timestamp |

- **timestamp** – Required, ISO 8601 (e.g. `2025-03-02T14:00:00.000Z`).
- **expectedRtp** – Optional; for `win` events, used to detect slot/meter tampering when outside configured range.
- **statusCode** – Optional; for `request` events, used to track bad requests (4xx/5xx).

## What gets detected

- **Odd %** – Session/aggregate win rate above threshold (e.g. 65%).
- **Bad requests** – 4xx/5xx on `request` events.
- **RTP / slot tampering** – `win` events with `expectedRtp` outside allowed range.
- **Rate abuse** – Too many `request` events per session per minute.
- **Collusion** – Multiple players at same table when some are on the watch list.
- **Chip passing** – Large `chip_move` amounts between players.

## Example: Node.js

```js
const res = await fetch('https://your-tracker-host/api/ingest', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    events: [
      { type: 'bet', playerId: 'P1', sessionId: 'S1', gameId: 'blackjack-1', amount: 100, timestamp: new Date().toISOString() },
      { type: 'request', sessionId: 'S1', path: '/api/bet', method: 'POST', statusCode: 200, timestamp: new Date().toISOString() },
    ],
  }),
});
const data = await res.json(); // { ok: true, ingested: 2, alerts: 0 }
```

## Example: cURL

```bash
curl -X POST https://your-tracker-host/api/ingest \
  -H "Content-Type: application/json" \
  -d '{"events":[{"type":"request","sessionId":"s1","path":"/api/spin","statusCode":401,"timestamp":"2025-03-02T12:00:00Z"}]}'
```

## Response

- **200** – `{ "ok": true, "ingested": N, "alerts": M }`  
  `N` = number of events accepted; `M` = number of new alerts raised from this batch.
- **400** – Invalid JSON or body (e.g. no events array).

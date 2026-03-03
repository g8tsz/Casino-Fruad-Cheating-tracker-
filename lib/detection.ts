/**
 * Fraud & cheating detection: RTP/slot tampering, bad requests, odd %, collusion, capping, chip passing.
 * Runs on ingested events; thresholds configurable via env.
 */
import type { CasinoEvent, FraudAlert, FraudType, Severity } from './types';
import { persistAlert } from './store';
import { getRecentEvents, isOnWatchList } from './store';

const RTP_MIN = Number(process.env.RTP_MIN_PCT) || 85;
const RTP_MAX = Number(process.env.RTP_MAX_PCT) || 102;
const BAD_REQUEST_THRESHOLD = Number(process.env.BAD_REQUEST_RATE_THRESHOLD) || 0.15;
const WIN_RATE_SUSPICIOUS = Number(process.env.WIN_RATE_SUSPICIOUS_PCT) || 65;
const RATE_ABUSE_REQUESTS_PER_MIN = Number(process.env.RATE_ABUSE_PER_MIN) || 120;

function severityFor(type: FraudType, metric?: number): Severity {
  if (type === 'bad_request' || type === 'rate_abuse') return metric && metric > 0.5 ? 'high' : 'medium';
  if (type === 'slot_tampering' || type === 'meter_anomaly') return 'high';
  if (type === 'collusion' || type === 'card_counting') return 'high';
  if (type === 'odd_percentage') return metric && metric > 80 ? 'critical' : 'high';
  return 'medium';
}

export async function runDetections(events: CasinoEvent[]): Promise<FraudAlert[]> {
  const raised: FraudAlert[] = [];
  const now = new Date().toISOString();

  for (const evt of events) {
    if (evt.type === 'request') {
      const alert = detectBadRequest(evt, events);
      if (alert) {
        await persistAlert(alert);
        raised.push(alert);
      }
    }
    if (evt.type === 'win' && evt.amount != null && evt.expectedRtp != null) {
      const alert = detectRtpAnomaly(evt);
      if (alert) {
        await persistAlert(alert);
        raised.push(alert);
      }
    }
    if (evt.type === 'chip_move') {
      const alert = detectChipPassing(evt, events);
      if (alert) {
        await persistAlert(alert);
        raised.push(alert);
      }
    }
  }

  // Session/player-level checks on recent window
  const recent = getRecentEvents(300);
  const oddPctAlert = detectOddPercentage(recent);
  if (oddPctAlert) {
    await persistAlert(oddPctAlert);
    raised.push(oddPctAlert);
  }
  const rateAlert = detectRateAbuse(recent);
  if (rateAlert) {
    await persistAlert(rateAlert);
    raised.push(rateAlert);
  }
  const collusionAlert = detectCollusionSignals(recent);
  if (collusionAlert) {
    await persistAlert(collusionAlert);
    raised.push(collusionAlert);
  }

  return raised;
}

function detectBadRequest(evt: CasinoEvent, _all: CasinoEvent[]): Omit<FraudAlert, 'id'> | null {
  const code = evt.statusCode ?? 0;
  if (code >= 400 && code < 500) {
    const severity = code === 401 || code === 403 ? 'high' : 'medium';
    return {
      type: 'bad_request',
      severity: severity as Severity,
      title: `Bad request: ${evt.path ?? 'unknown'} → ${code}`,
      description: `Client error ${code} on ${evt.method ?? 'GET'} ${evt.path ?? ''}. Possible probe or abuse.`,
      timestamp: evt.timestamp,
      sourceId: evt.sessionId,
      suggestedAction: 'Check logs; consider rate limit or block if repeated.',
      acknowledged: false,
    };
  }
  if (code >= 500) {
    return {
      type: 'bad_request',
      severity: 'medium',
      title: `Server error: ${evt.path ?? 'unknown'} → ${code}`,
      description: `Server returned ${code}. Monitor for exploitation attempts.`,
      timestamp: evt.timestamp,
      sourceId: evt.sessionId,
      suggestedAction: 'Review server logs and error rate.',
      acknowledged: false,
    };
  }
  return null;
}

function detectRtpAnomaly(evt: CasinoEvent): Omit<FraudAlert, 'id'> | null {
  const rtp = evt.expectedRtp!;
  if (rtp < RTP_MIN || rtp > RTP_MAX) {
    return {
      type: 'slot_tampering',
      severity: 'high',
      title: `RTP out of range: ${rtp.toFixed(1)}%`,
      description: `Observed RTP ${rtp.toFixed(1)}% for game ${evt.gameId ?? 'unknown'}. Expected range ${RTP_MIN}–${RTP_MAX}%.`,
      timestamp: evt.timestamp,
      gameId: evt.gameId,
      playerId: evt.playerId,
      metric: rtp,
      expectedRange: `${RTP_MIN}–${RTP_MAX}%`,
      suggestedAction: 'Verify meter readings; lock game and schedule technical review.',
      acknowledged: false,
    };
  }
  return null;
}

function detectChipPassing(evt: CasinoEvent, _all: CasinoEvent[]): Omit<FraudAlert, 'id'> | null {
  if (!evt.fromPlayerId || !evt.toPlayerId || !evt.amount) return null;
  const large = (evt.amount as number) > 5000;
  if (large) {
    return {
      type: 'chip_passing',
      severity: 'high',
      title: 'Large chip move between players',
      description: `Chip movement of ${evt.amount} from player ${evt.fromPlayerId} to ${evt.toPlayerId}. Possible capping or collusion.`,
      timestamp: evt.timestamp,
      tableId: evt.tableId,
      suggestedAction: 'Review surveillance; confirm bet placement rules.',
      acknowledged: false,
    };
  }
  return null;
}

function detectOddPercentage(recent: CasinoEvent[]): Omit<FraudAlert, 'id'> | null {
  const wins = recent.filter((e) => e.type === 'win' && e.amount != null);
  const bets = recent.filter((e) => e.type === 'bet' && e.amount != null);
  if (bets.length < 20) return null;
  const totalBet = bets.reduce((s, e) => s + (e.amount ?? 0), 0);
  const totalWin = wins.reduce((s, e) => s + (e.amount ?? 0), 0);
  if (totalBet <= 0) return null;
  const winPct = (totalWin / totalBet) * 100;
  if (winPct >= WIN_RATE_SUSPICIOUS) {
    return {
      type: 'odd_percentage',
      severity: winPct > 80 ? 'critical' : 'high',
      title: `Suspicious win rate: ${winPct.toFixed(1)}%`,
      description: `Session/aggregate win rate ${winPct.toFixed(1)}% over ${bets.length} bets. Expected range typically below ${WIN_RATE_SUSPICIOUS}%.`,
      timestamp: new Date().toISOString(),
      metric: winPct,
      expectedRange: `< ${WIN_RATE_SUSPICIOUS}%`,
      suggestedAction: 'Review player session; check for exploit or game bug.',
      acknowledged: false,
    };
  }
  return null;
}

function detectRateAbuse(recent: CasinoEvent[]): Omit<FraudAlert, 'id'> | null {
  const requests = recent.filter((e) => e.type === 'request');
  const bySession = new Map<string, CasinoEvent[]>();
  for (const r of requests) {
    const key = r.sessionId ?? r.playerId ?? 'unknown';
    if (!bySession.has(key)) bySession.set(key, []);
    bySession.get(key)!.push(r);
  }
  const oneMinAgo = Date.now() - 60 * 1000;
  for (const [, evts] of bySession) {
    const inLastMin = evts.filter((e) => new Date(e.timestamp).getTime() > oneMinAgo).length;
    if (inLastMin >= RATE_ABUSE_REQUESTS_PER_MIN) {
      return {
        type: 'rate_abuse',
        severity: 'high',
        title: `High request rate: ${inLastMin}/min`,
        description: `Session/player exceeded ${RATE_ABUSE_REQUESTS_PER_MIN} requests/min. Possible bot or scraping.`,
        timestamp: new Date().toISOString(),
        metric: inLastMin / RATE_ABUSE_REQUESTS_PER_MIN,
        suggestedAction: 'Apply rate limit; consider CAPTCHA or block.',
        acknowledged: false,
      };
    }
  }
  return null;
}

function detectCollusionSignals(recent: CasinoEvent[]): Omit<FraudAlert, 'id'> | null {
  const byTable = new Map<string, CasinoEvent[]>();
  for (const e of recent) {
    const t = e.tableId ?? e.gameId ?? 'unknown';
    if (!byTable.has(t)) byTable.set(t, []);
    byTable.get(t)!.push(e);
  }
  for (const [tableId, evts] of byTable) {
    const players = new Set(evts.map((e) => e.playerId).filter(Boolean));
    const bets = evts.filter((e) => e.type === 'bet');
    if (players.size >= 2 && bets.length >= 10) {
      const sameTable = Array.from(players).some((p) => isOnWatchList(p as string));
      if (sameTable) {
        return {
          type: 'collusion',
          severity: 'high',
          title: 'Possible collusion at table',
          description: `Multiple players at table ${tableId} with prior watch-list flag. Correlated activity.`,
          timestamp: new Date().toISOString(),
          tableId,
          suggestedAction: 'Review surveillance; consider table move or observation.',
          acknowledged: false,
        };
      }
    }
  }
  return null;
}

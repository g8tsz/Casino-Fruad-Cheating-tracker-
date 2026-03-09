/**
 * Fraud & cheating detection: RTP/slot tampering, bad requests, odd %, collusion, capping, chip passing,
 * repeated bet (bot), impossible win sequence, session length/time-of-day, geo/device multi-account.
 * Thresholds from lib/config (preset + env).
 */
import type { CasinoEvent, FraudAlert, FraudType, Severity } from './types';
import { getThresholds } from './config';
import { persistAlert } from './store';
import { getRecentEvents, isOnWatchList } from './store';

function cfg() {
  return getThresholds();
}

// In-memory cooldown: "type:playerId" or "type:sessionId" -> last raised time
const alertCooldown = new Map<string, number>();

function cooldownKey(type: FraudType, evt?: { playerId?: string; sessionId?: string; tableId?: string }): string {
  const entity = evt?.playerId || evt?.sessionId || evt?.tableId || 'global';
  return `${type}:${entity}`;
}

function shouldRaise(type: FraudType, evt?: { playerId?: string; sessionId?: string; tableId?: string }): boolean {
  const key = cooldownKey(type, evt);
  const last = alertCooldown.get(key);
  const now = Date.now();
  if (last && now - last < cfg().alertCooldownMs) return false;
  alertCooldown.set(key, now);
  return true;
}

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
        const saved = await persistAlert(alert);
        raised.push(saved);
      }
    }
    if (evt.type === 'win' && evt.amount != null && evt.expectedRtp != null) {
      const alert = detectRtpAnomaly(evt);
      if (alert) {
        const saved = await persistAlert(alert);
        raised.push(saved);
      }
    }
    if (evt.type === 'chip_move') {
      const alert = detectChipPassing(evt, events);
      if (alert) {
        const saved = await persistAlert(alert);
        raised.push(saved);
      }
    }
  }

  // Session/player-level checks on recent window
  const recent = getRecentEvents(300);
  const oddPctAlert = detectOddPercentage(recent);
  if (oddPctAlert && shouldRaise('odd_percentage', { playerId: oddPctAlert.playerId, sessionId: oddPctAlert.sessionId })) {
    raised.push(await persistAlert(oddPctAlert));
  }
  const rateAlert = detectRateAbuse(recent);
  if (rateAlert && shouldRaise('rate_abuse', { sessionId: rateAlert.sessionId })) {
    raised.push(await persistAlert(rateAlert));
  }
  const collusionAlert = detectCollusionSignals(recent);
  if (collusionAlert && shouldRaise('collusion', { tableId: collusionAlert.tableId })) {
    raised.push(await persistAlert(collusionAlert));
  }

  // New: repeated same bet amount (possible bot)
  const repeatedBetAlerts = detectRepeatedBetAmount(recent);
  for (const alert of repeatedBetAlerts) {
    if (shouldRaise('repeated_bet_bot', { playerId: alert.playerId, sessionId: alert.sessionId })) {
      raised.push(await persistAlert(alert));
    }
  }
  const impossibleAlert = detectImpossibleWinSequence(recent);
  if (impossibleAlert && shouldRaise('impossible_win_sequence', { playerId: impossibleAlert.playerId })) {
    raised.push(await persistAlert(impossibleAlert));
  }
  const sessionLenAlert = detectSessionLengthAnomaly(recent);
  if (sessionLenAlert && shouldRaise('session_length_anomaly', { sessionId: sessionLenAlert.sessionId })) {
    raised.push(await persistAlert(sessionLenAlert));
  }
  const todAlert = detectTimeOfDayAnomaly(recent);
  if (todAlert && shouldRaise('time_of_day_anomaly', { sessionId: todAlert.sessionId })) {
    raised.push(await persistAlert(todAlert));
  }
  const ipAlert = detectMultiAccountIp(recent);
  if (ipAlert && shouldRaise('multi_account_ip', { playerId: ipAlert.playerId })) {
    raised.push(await persistAlert(ipAlert));
  }
  const devAlert = detectMultiAccountDevice(recent);
  if (devAlert && shouldRaise('multi_account_device', { playerId: devAlert.playerId })) {
    raised.push(await persistAlert(devAlert));
  }

  // Per-player suspicious win rate (same threshold, but per player for clearer attribution)
  const perPlayerAlerts = detectPerPlayerOddPercentage(recent);
  for (const alert of perPlayerAlerts) {
    if (shouldRaise('odd_percentage', { playerId: alert.playerId })) {
      raised.push(await persistAlert(alert));
    }
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
  const { rtpMin, rtpMax } = cfg();
  const rtp = evt.expectedRtp!;
  if (rtp < rtpMin || rtp > rtpMax) {
    return {
      type: 'slot_tampering',
      severity: 'high',
      title: `RTP out of range: ${rtp.toFixed(1)}%`,
      description: `Observed RTP ${rtp.toFixed(1)}% for game ${evt.gameId ?? 'unknown'}. Expected range ${rtpMin}–${rtpMax}%.`,
      timestamp: evt.timestamp,
      gameId: evt.gameId,
      playerId: evt.playerId,
      metric: rtp,
      expectedRange: `${rtpMin}–${rtpMax}%`,
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
  const winRateSuspicious = cfg().winRateSuspiciousPct;
  const wins = recent.filter((e) => e.type === 'win' && e.amount != null);
  const bets = recent.filter((e) => e.type === 'bet' && e.amount != null);
  if (bets.length < 20) return null;
  const totalBet = bets.reduce((s, e) => s + (e.amount ?? 0), 0);
  const totalWin = wins.reduce((s, e) => s + (e.amount ?? 0), 0);
  if (totalBet <= 0) return null;
  const winPct = (totalWin / totalBet) * 100;
  if (winPct >= winRateSuspicious) {
    return {
      type: 'odd_percentage',
      severity: winPct > 80 ? 'critical' : 'high',
      title: `Suspicious win rate: ${winPct.toFixed(1)}%`,
      description: `Session/aggregate win rate ${winPct.toFixed(1)}% over ${bets.length} bets. Expected range typically below ${winRateSuspicious}%.`,
      timestamp: new Date().toISOString(),
      metric: winPct,
      expectedRange: `< ${winRateSuspicious}%`,
      suggestedAction: 'Review player session; check for exploit or game bug.',
      acknowledged: false,
    };
  }
  return null;
}

/** Per-player suspicious win rate: flag specific players with abnormally high win % over recent bets. */
function detectPerPlayerOddPercentage(recent: CasinoEvent[]): Array<Omit<FraudAlert, 'id'>> {
  const bets = recent.filter((e) => e.type === 'bet' && e.amount != null && e.playerId);
  const wins = recent.filter((e) => e.type === 'win' && e.amount != null && e.playerId);
  const byPlayer = new Map<string, { bet: number; win: number; count: number }>();
  for (const e of bets) {
    const p = e.playerId!;
    if (!byPlayer.has(p)) byPlayer.set(p, { bet: 0, win: 0, count: 0 });
    const row = byPlayer.get(p)!;
    row.bet += e.amount ?? 0;
    row.count += 1;
  }
  for (const e of wins) {
    const p = e.playerId!;
    if (!byPlayer.has(p)) byPlayer.set(p, { bet: 0, win: 0, count: 0 });
    byPlayer.get(p)!.win += e.amount ?? 0;
  }
  const out: Array<Omit<FraudAlert, 'id'>> = [];
  const winRateSuspicious = cfg().winRateSuspiciousPct;
  for (const [playerId, row] of Array.from(byPlayer)) {
    if (row.count < 15 || row.bet <= 0) continue;
    const winPct = (row.win / row.bet) * 100;
    if (winPct >= winRateSuspicious) {
      out.push({
        type: 'odd_percentage',
        severity: winPct > 80 ? 'critical' : 'high',
        title: `Player ${playerId}: suspicious win rate ${winPct.toFixed(1)}%`,
        description: `Player ${playerId} has ${winPct.toFixed(1)}% win rate over ${row.count} bets (bet ${row.bet}, won ${row.win}).`,
        timestamp: new Date().toISOString(),
        playerId,
        metric: winPct,
        expectedRange: `< ${winRateSuspicious}%`,
        suggestedAction: 'Review player history; consider watch list or session review.',
        acknowledged: false,
      });
    }
  }
  return out;
}

function detectRateAbuse(recent: CasinoEvent[]): Omit<FraudAlert, 'id'> | null {
  const requests = recent.filter((e) => e.type === 'request');
  const bySession = new Map<string, CasinoEvent[]>();
  for (const r of requests) {
    const key = r.sessionId ?? r.playerId ?? 'unknown';
    if (!bySession.has(key)) bySession.set(key, []);
    bySession.get(key)!.push(r);
  }
  const rateLimit = cfg().rateAbusePerMin;
  const oneMinAgo = Date.now() - 60 * 1000;
  for (const [sess, evts] of Array.from(bySession)) {
    const inLastMin = evts.filter((e) => new Date(e.timestamp).getTime() > oneMinAgo).length;
    if (inLastMin >= rateLimit) {
      return {
        type: 'rate_abuse',
        severity: 'high',
        title: `High request rate: ${inLastMin}/min`,
        description: `Session/player exceeded ${rateLimit} requests/min. Possible bot or scraping.`,
        timestamp: new Date().toISOString(),
        sessionId: sess !== 'unknown' ? sess : undefined,
        metric: inLastMin / rateLimit,
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
  for (const [tableId, evts] of Array.from(byTable)) {
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

/** Repeated same bet amount (possible bot). */
function detectRepeatedBetAmount(recent: CasinoEvent[]): Array<Omit<FraudAlert, 'id'>> {
  const threshold = cfg().repeatedBetCountThreshold;
  const bets = recent.filter((e) => e.type === 'bet' && e.amount != null && (e.playerId || e.sessionId));
  const byEntity = new Map<string, CasinoEvent[]>();
  for (const b of bets) {
    const key = b.playerId ?? b.sessionId ?? 'unknown';
    if (!byEntity.has(key)) byEntity.set(key, []);
    byEntity.get(key)!.push(b);
  }
  const out: Array<Omit<FraudAlert, 'id'>> = [];
  for (const [entity, evts] of Array.from(byEntity)) {
    const byAmount = new Map<number, number>();
    for (const e of evts) {
      const amt = e.amount!;
      byAmount.set(amt, (byAmount.get(amt) ?? 0) + 1);
    }
    for (const [amount, count] of Array.from(byAmount)) {
      if (count >= threshold) {
        out.push({
          type: 'repeated_bet_bot',
          severity: 'medium',
          title: `Repeated bet amount: ${amount} × ${count}`,
          description: `Same bet amount ${amount} repeated ${count} times. Possible bot or scripted play.`,
          timestamp: new Date().toISOString(),
          playerId: entity !== 'unknown' ? entity : undefined,
          sessionId: entity !== 'unknown' ? entity : undefined,
          metric: count,
          suggestedAction: 'Review player session; consider CAPTCHA or limit identical bets.',
          acknowledged: false,
        });
        break;
      }
    }
  }
  return out;
}

/** Win without prior bet in same session (impossible sequence). */
function detectImpossibleWinSequence(recent: CasinoEvent[]): Omit<FraudAlert, 'id'> | null {
  const bySession = new Map<string, { bets: number; wins: number }>();
  for (const e of recent) {
    const key = e.sessionId ?? e.playerId ?? 'global';
    if (!bySession.has(key)) bySession.set(key, { bets: 0, wins: 0 });
    const row = bySession.get(key)!;
    if (e.type === 'bet') row.bets++;
    if (e.type === 'win') row.wins++;
  }
  for (const [session, row] of Array.from(bySession)) {
    if (row.wins >= 3 && row.bets === 0) {
      return {
        type: 'impossible_win_sequence',
        severity: 'high',
        title: 'Impossible win sequence',
        description: `Session has ${row.wins} win(s) with no prior bet events. Possible data tampering or ingest error.`,
        timestamp: new Date().toISOString(),
        sessionId: session !== 'global' ? session : undefined,
        playerId: session !== 'global' ? session : undefined,
        suggestedAction: 'Verify event order and ingest pipeline.',
        acknowledged: false,
      };
    }
  }
  return null;
}

/** Session length exceeds configured max hours. */
function detectSessionLengthAnomaly(recent: CasinoEvent[]): Omit<FraudAlert, 'id'> | null {
  const maxHours = cfg().sessionLengthMaxHours;
  const sessions = new Map<string, { first: number; last: number }>();
  for (const e of recent) {
    const key = e.sessionId ?? e.playerId ?? 'unknown';
    if (!key || key === 'unknown') continue;
    const t = new Date(e.timestamp).getTime();
    if (!sessions.has(key)) sessions.set(key, { first: t, last: t });
    const row = sessions.get(key)!;
    row.first = Math.min(row.first, t);
    row.last = Math.max(row.last, t);
  }
  for (const [sessionId, row] of Array.from(sessions)) {
    const hours = (row.last - row.first) / (60 * 60 * 1000);
    if (hours >= maxHours) {
      return {
        type: 'session_length_anomaly',
        severity: 'medium',
        title: `Session length anomaly: ${hours.toFixed(1)}h`,
        description: `Session ${sessionId} spans ${hours.toFixed(1)} hours (max ${maxHours}h). Unusual duration.`,
        timestamp: new Date().toISOString(),
        sessionId,
        metric: hours,
        suggestedAction: 'Review session; consider session timeout or limits.',
        acknowledged: false,
      };
    }
  }
  return null;
}

/** Unusual time-of-day concentration (e.g. all activity in one hour). */
function detectTimeOfDayAnomaly(recent: CasinoEvent[]): Omit<FraudAlert, 'id'> | null {
  if (recent.length < 30) return null;
  const byHour = new Map<number, number>();
  for (const e of recent) {
    const h = new Date(e.timestamp).getUTCHours();
    byHour.set(h, (byHour.get(h) ?? 0) + 1);
  }
  const values = Array.from(byHour.values());
  const max = values.length > 0 ? Math.max(...values) : 0;
  const total = recent.length;
  if (total >= 30 && max / total >= 0.7) {
    const hour = Array.from(byHour.entries()).find(([, c]) => c === max)?.[0] ?? 0;
    return {
      type: 'time_of_day_anomaly',
      severity: 'low',
      title: `Time-of-day concentration: ${hour}:00 UTC`,
      description: `${Math.round((max / total) * 100)}% of events in one hour. May indicate automated or scripted activity.`,
      timestamp: new Date().toISOString(),
      metric: max / total,
      suggestedAction: 'Review activity pattern; optional additional checks.',
      acknowledged: false,
    };
  }
  return null;
}

/** Same IP, many different players (multi-account). */
function detectMultiAccountIp(recent: CasinoEvent[]): Omit<FraudAlert, 'id'> | null {
  const threshold = cfg().playersPerIpThreshold;
  const withIp = recent.filter((e) => e.ip && (e.playerId || e.sessionId));
  if (withIp.length < threshold * 2) return null;
  const byIp = new Map<string, Set<string>>();
  for (const e of withIp) {
    const ip = e.ip!;
    const entity = e.playerId ?? e.sessionId ?? 'unknown';
    if (!byIp.has(ip)) byIp.set(ip, new Set());
    byIp.get(ip)!.add(entity);
  }
  for (const [ip, players] of Array.from(byIp)) {
    if (players.size >= threshold) {
      return {
        type: 'multi_account_ip',
        severity: 'high',
        title: `Multiple players from same IP: ${players.size}`,
        description: `IP ${ip} has ${players.size} distinct players/sessions. Possible multi-accounting.`,
        timestamp: new Date().toISOString(),
        playerId: Array.from(players)[0],
        suggestedAction: 'Review IP; consider device fingerprint or block.',
        acknowledged: false,
      };
    }
  }
  return null;
}

/** Same deviceId, many different players (multi-account). */
function detectMultiAccountDevice(recent: CasinoEvent[]): Omit<FraudAlert, 'id'> | null {
  const threshold = cfg().playersPerDeviceThreshold;
  const withDev = recent.filter((e) => e.deviceId && (e.playerId || e.sessionId));
  if (withDev.length < threshold * 2) return null;
  const byDevice = new Map<string, Set<string>>();
  for (const e of withDev) {
    const dev = e.deviceId!;
    const entity = e.playerId ?? e.sessionId ?? 'unknown';
    if (!byDevice.has(dev)) byDevice.set(dev, new Set());
    byDevice.get(dev)!.add(entity);
  }
  for (const [deviceId, players] of Array.from(byDevice)) {
    if (players.size >= threshold) {
      return {
        type: 'multi_account_device',
        severity: 'high',
        title: `Multiple players from same device: ${players.size}`,
        description: `Device ${deviceId.slice(0, 12)}... has ${players.size} distinct players. Possible multi-accounting.`,
        timestamp: new Date().toISOString(),
        playerId: Array.from(players)[0],
        suggestedAction: 'Review device; consider account linking rules.',
        acknowledged: false,
      };
    }
  }
  return null;
}

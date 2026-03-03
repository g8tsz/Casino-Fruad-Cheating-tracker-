/**
 * In-memory store for alerts, watch list, and recent events.
 * For production with live data: replace with DB or call external API via env.
 */
import type { FraudAlert, WatchListEntry, CasinoEvent } from './types';

const DATA_SOURCE = process.env.DATA_SOURCE || 'memory';
const LIVE_API_BASE = (process.env.LIVE_API_BASE_URL || '').replace(/\/$/, '');

// In-memory (used when DATA_SOURCE=memory or for fallback)
const alerts: FraudAlert[] = [];
const watchList: WatchListEntry[] = [];
const recentEvents: CasinoEvent[] = [];
const MAX_EVENTS = 5000;
const MAX_ALERTS = 500;

function addAlert(alert: Omit<FraudAlert, 'id'>): FraudAlert {
  const full: FraudAlert = { ...alert, id: `alert-${Date.now()}-${Math.random().toString(36).slice(2, 9)}` };
  alerts.unshift(full);
  if (alerts.length > MAX_ALERTS) alerts.pop();
  return full;
}

function addEvent(evt: CasinoEvent): void {
  recentEvents.unshift(evt);
  if (recentEvents.length > MAX_EVENTS) recentEvents.pop();
}

async function fetchLive<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${LIVE_API_BASE}${path}`, {
    ...init,
    headers: {
      ...(init?.headers as Record<string, string>),
      ...(process.env.LIVE_API_KEY ? { Authorization: `Bearer ${process.env.LIVE_API_KEY}` } : {}),
    },
  });
  if (!res.ok) throw new Error(`Live API error: ${res.status} ${path}`);
  return res.json();
}

export function getAlerts(limit = 100): FraudAlert[] {
  return alerts.slice(0, limit);
}

export function getWatchList(activeOnly = true): WatchListEntry[] {
  const now = new Date().toISOString();
  const list = activeOnly
    ? watchList.filter((w) => w.active && (!w.expiresAt || w.expiresAt > now))
    : watchList;
  return list.slice(0, 200);
}

export function getRecentEvents(limit = 200): CasinoEvent[] {
  return recentEvents.slice(0, limit);
}

export function isOnWatchList(playerId?: string, sessionId?: string, tableId?: string): boolean {
  const list = getWatchList();
  if (playerId && list.some((w) => w.kind === 'player' && w.value === playerId)) return true;
  if (sessionId && list.some((w) => w.kind === 'session' && w.value === sessionId)) return true;
  if (tableId && list.some((w) => w.kind === 'table' && w.value === tableId)) return true;
  return false;
}

export async function persistAlert(alert: Omit<FraudAlert, 'id'>): Promise<FraudAlert> {
  if (DATA_SOURCE === 'api' && LIVE_API_BASE) {
    return fetchLive<FraudAlert>('/api/fraud/alerts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(alert),
    });
  }
  return addAlert(alert);
}

export async function persistEvents(events: CasinoEvent[]): Promise<void> {
  events.forEach(addEvent);
  if (DATA_SOURCE === 'api' && LIVE_API_BASE && events.length > 0) {
    await fetchLive('/api/fraud/ingest', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ events }),
    }).catch(() => {});
  }
}

export function addToWatchList(entry: Omit<WatchListEntry, 'id' | 'addedAt'>): WatchListEntry {
  const full: WatchListEntry = {
    ...entry,
    id: `wl-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    addedAt: new Date().toISOString(),
  };
  watchList.push(full);
  return full;
}

export function acknowledgeAlert(id: string): void {
  const a = alerts.find((x) => x.id === id);
  if (a) a.acknowledged = true;
}

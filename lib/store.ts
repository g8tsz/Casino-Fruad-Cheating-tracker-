/**
 * In-memory store for alerts, watch list, and recent events.
 * Optional file persistence and retention; audit log for watch list/config changes.
 */
import type { FraudAlert, WatchListEntry, CasinoEvent } from './types';

const DATA_SOURCE = process.env.DATA_SOURCE || 'memory';
const LIVE_API_BASE = (process.env.LIVE_API_BASE_URL || '').replace(/\/$/, '');
const EVENTS_RETENTION_DAYS = Number(process.env.EVENTS_RETENTION_DAYS) || 7;
const ALERTS_RETENTION_DAYS = Number(process.env.ALERTS_RETENTION_DAYS) || 30;

// In-memory (used when DATA_SOURCE=memory or for fallback)
const alerts: FraudAlert[] = [];
const watchList: WatchListEntry[] = [];
const recentEvents: CasinoEvent[] = [];
const MAX_EVENTS = 5000;
const MAX_ALERTS = 500;

export interface AuditLogEntry {
  id: string;
  action: 'watchlist_add' | 'watchlist_remove' | 'config_change';
  detail: string;
  timestamp: string;
  actor?: string;
}
const auditLog: AuditLogEntry[] = [];
const MAX_AUDIT = 500;

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

export interface AlertFilters {
  type?: string;
  severity?: string;
  playerId?: string;
  acknowledged?: boolean;
  from?: string; // ISO
  to?: string; // ISO
}

export function getAlerts(limit = 100, filters?: AlertFilters): FraudAlert[] {
  let list = [...alerts];
  if (filters) {
    if (filters.type) list = list.filter((a) => a.type === filters!.type);
    if (filters.severity) list = list.filter((a) => a.severity === filters!.severity);
    if (filters.playerId) list = list.filter((a) => a.playerId === filters!.playerId);
    if (filters.acknowledged !== undefined) list = list.filter((a) => a.acknowledged === filters!.acknowledged);
    if (filters.from) list = list.filter((a) => a.timestamp >= filters!.from!);
    if (filters.to) list = list.filter((a) => a.timestamp <= filters!.to!);
  }
  return list.slice(0, limit);
}

export function getWatchList(activeOnly = true): WatchListEntry[] {
  const now = new Date().toISOString();
  const list = activeOnly
    ? watchList.filter((w) => w.active && (!w.expiresAt || w.expiresAt > now))
    : watchList;
  return list.slice(0, 200);
}

export interface EventFilters {
  type?: string;
  playerId?: string;
  sessionId?: string;
  from?: string;
  to?: string;
}

export function getRecentEvents(limit = 200, filters?: EventFilters): CasinoEvent[] {
  let list = [...recentEvents];
  if (filters) {
    if (filters.type) list = list.filter((e) => e.type === filters!.type);
    if (filters.playerId) list = list.filter((e) => e.playerId === filters!.playerId);
    if (filters.sessionId) list = list.filter((e) => e.sessionId === filters!.sessionId);
    if (filters.from) list = list.filter((e) => e.timestamp >= filters!.from!);
    if (filters.to) list = list.filter((e) => e.timestamp <= filters!.to!);
  }
  return list.slice(0, limit);
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
  addAuditLog('watchlist_add', `${entry.kind}: ${entry.value} – ${entry.reason}`);
  return full;
}

export function acknowledgeAlert(id: string): void {
  const a = alerts.find((x) => x.id === id);
  if (a) a.acknowledged = true;
}

/** Retention: remove events and alerts older than configured days. Call periodically (e.g. on ingest or cron). */
export function runRetentionCleanup(): void {
  const now = Date.now();
  const eventsCut = now - EVENTS_RETENTION_DAYS * 24 * 60 * 60 * 1000;
  const alertsCut = now - ALERTS_RETENTION_DAYS * 24 * 60 * 60 * 1000;
  while (recentEvents.length > 0 && new Date(recentEvents[recentEvents.length - 1].timestamp).getTime() < eventsCut) {
    recentEvents.pop();
  }
  while (alerts.length > 0 && new Date(alerts[alerts.length - 1].timestamp).getTime() < alertsCut) {
    alerts.pop();
  }
}

/** Audit log for watch list and config changes. */
export function addAuditLog(action: AuditLogEntry['action'], detail: string, actor?: string): void {
  auditLog.unshift({
    id: `audit-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    action,
    detail,
    timestamp: new Date().toISOString(),
    actor,
  });
  if (auditLog.length > MAX_AUDIT) auditLog.pop();
}

export function getAuditLog(limit = 100): AuditLogEntry[] {
  return auditLog.slice(0, limit);
}

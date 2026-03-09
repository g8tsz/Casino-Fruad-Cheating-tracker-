/**
 * Ingest endpoint for website casinos. POST an array of events (bets, wins, requests, etc.).
 * Idempotency-Key support, validation with clear errors, rate limit, webhook on high/critical alerts.
 */
import { NextResponse } from 'next/server';
import { persistEvents, runRetentionCleanup } from '@/lib/store';
import { runDetections } from '@/lib/detection';
import { checkRateLimit } from '@/lib/rateLimit';
import type { CasinoEvent } from '@/lib/types';

const EVENT_TYPES = ['bet', 'win', 'request', 'session_start', 'session_end', 'chip_move'] as const;

const idempotencySeen = new Map<string, { ingested: number; alerts: number; at: number }>();
const IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1000;

function pruneIdempotency(): void {
  if (idempotencySeen.size < 1000) return;
  const now = Date.now();
  Array.from(idempotencySeen.entries()).forEach(([k, v]) => {
    if (now - v.at > IDEMPOTENCY_TTL_MS) idempotencySeen.delete(k);
  });
}

export interface ValidationError {
  index: number;
  field?: string;
  message: string;
}

function validateEvent(raw: unknown, index: number): { ok: CasinoEvent; errors: ValidationError[] } {
  const errors: ValidationError[] = [];
  if (raw === null || typeof raw !== 'object') {
    errors.push({ index, message: 'Event must be an object' });
    return { ok: null as unknown as CasinoEvent, errors };
  }
  const r = raw as Record<string, unknown>;
  const type = r.type;
  if (typeof type !== 'string' || !EVENT_TYPES.includes(type as (typeof EVENT_TYPES)[number])) {
    errors.push({ index, field: 'type', message: `type must be one of: ${EVENT_TYPES.join(', ')}` });
  }
  const timestamp = r.timestamp;
  if (typeof timestamp !== 'string' && timestamp !== undefined) {
    errors.push({ index, field: 'timestamp', message: 'timestamp must be an ISO date string' });
  }
  if (r.amount !== undefined && (typeof r.amount !== 'number' || !Number.isFinite(r.amount))) {
    errors.push({ index, field: 'amount', message: 'amount must be a number' });
  }
  if (r.statusCode !== undefined && (typeof r.statusCode !== 'number' || r.statusCode < 0 || r.statusCode > 599)) {
    errors.push({ index, field: 'statusCode', message: 'statusCode must be 0-599' });
  }
  if (r.expectedRtp !== undefined && (typeof r.expectedRtp !== 'number' || r.expectedRtp < 0 || r.expectedRtp > 100)) {
    errors.push({ index, field: 'expectedRtp', message: 'expectedRtp must be 0-100' });
  }
  if (errors.length > 0) return { ok: null as unknown as CasinoEvent, errors };

  const ok: CasinoEvent = {
    type: (r.type as string) as CasinoEvent['type'],
    playerId: typeof r.playerId === 'string' ? r.playerId : undefined,
    sessionId: typeof r.sessionId === 'string' ? r.sessionId : undefined,
    gameId: typeof r.gameId === 'string' ? r.gameId : undefined,
    tableId: typeof r.tableId === 'string' ? r.tableId : undefined,
    amount: typeof r.amount === 'number' ? r.amount : undefined,
    timestamp: (typeof r.timestamp === 'string' ? r.timestamp : undefined) || new Date().toISOString(),
    statusCode: typeof r.statusCode === 'number' ? r.statusCode : undefined,
    path: typeof r.path === 'string' ? r.path : undefined,
    method: typeof r.method === 'string' ? r.method : undefined,
    responseTimeMs: typeof r.responseTimeMs === 'number' ? r.responseTimeMs : undefined,
    expectedRtp: typeof r.expectedRtp === 'number' ? r.expectedRtp : undefined,
    fromPlayerId: typeof r.fromPlayerId === 'string' ? r.fromPlayerId : undefined,
    toPlayerId: typeof r.toPlayerId === 'string' ? r.toPlayerId : undefined,
    ip: typeof r.ip === 'string' ? r.ip : undefined,
    deviceId: typeof r.deviceId === 'string' ? r.deviceId : undefined,
  };
  return { ok, errors };
}

async function sendWebhook(alerts: { severity: string; title: string; description: string }[]): Promise<void> {
  const url = process.env.WEBHOOK_URL;
  if (!url) return;
  try {
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        source: 'casino-fraud-tracker',
        timestamp: new Date().toISOString(),
        highOrCriticalAlerts: alerts,
      }),
    });
  } catch (e) {
    console.error('Webhook failed:', e);
  }
}

export async function POST(request: Request) {
  const ingestKey = process.env.INGEST_API_KEY;
  let rateLimitKey: string;
  if (ingestKey) {
    const auth = request.headers.get('authorization');
    const key = auth?.startsWith('Bearer ') ? auth.slice(7) : request.headers.get('x-api-key');
    if (key !== ingestKey) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    rateLimitKey = `key:${key}`;
  } else {
    const forwarded = request.headers.get('x-forwarded-for');
    const ip = forwarded?.split(',')[0]?.trim() ?? request.headers.get('x-real-ip') ?? 'unknown';
    rateLimitKey = `ip:${ip}`;
  }

  if (!checkRateLimit(rateLimitKey)) {
    return NextResponse.json(
      { error: 'Rate limit exceeded', message: 'Too many ingest requests per minute' },
      { status: 429 }
    );
  }

  const idemKey = request.headers.get('idempotency-key');
  if (idemKey) {
    pruneIdempotency();
    const cached = idempotencySeen.get(idemKey);
    if (cached) {
      return NextResponse.json({
        ok: true,
        ingested: cached.ingested,
        alerts: cached.alerts,
        idempotent: true,
      });
    }
  }

  try {
    const body = await request.json();
    const rawList = Array.isArray(body.events) ? body.events : Array.isArray(body) ? body : [];
    const validated: CasinoEvent[] = [];
    const allErrors: ValidationError[] = [];
    for (let i = 0; i < rawList.length; i++) {
      const { ok, errors } = validateEvent(rawList[i], i);
      allErrors.push(...errors);
      if (ok) validated.push(ok);
    }
    if (allErrors.length > 0) {
      return NextResponse.json(
        {
          error: 'Validation failed',
          message: allErrors[0].message,
          field: allErrors[0].field,
          index: allErrors[0].index,
          details: allErrors,
        },
        { status: 400 }
      );
    }
    if (validated.length === 0) {
      return NextResponse.json({ ok: true, ingested: 0, alerts: 0 });
    }

    await persistEvents(validated);
    const alerts = await runDetections(validated);
    runRetentionCleanup();

    const highOrCritical = alerts.filter((a) => a.severity === 'high' || a.severity === 'critical');
    if (highOrCritical.length > 0) {
      await sendWebhook(highOrCritical.map((a) => ({ severity: a.severity, title: a.title, description: a.description })));
    }

    const result = { ok: true, ingested: validated.length, alerts: alerts.length };
    if (idemKey) idempotencySeen.set(idemKey, { ingested: validated.length, alerts: alerts.length, at: Date.now() });

    return NextResponse.json(result);
  } catch (e) {
    console.error(e);
    return NextResponse.json(
      { error: 'Ingest failed', message: e instanceof Error ? e.message : 'Unknown error' },
      { status: 400 }
    );
  }
}

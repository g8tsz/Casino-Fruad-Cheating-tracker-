/**
 * Shared POST /api/ingest implementation (also mounted at /api/v1/ingest).
 */
import { NextResponse } from 'next/server';
import { persistEvents, runRetentionCleanup } from '@/lib/store';
import { runDetections } from '@/lib/detection';
import { checkRateLimit } from '@/lib/rateLimit';
import { parseIngestBody } from '@/lib/ingest-schema';

const idempotencySeen = new Map<string, { ingested: number; alerts: number; at: number }>();
const IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1000;

function pruneIdempotency(): void {
  if (idempotencySeen.size < 1000) return;
  const now = Date.now();
  Array.from(idempotencySeen.entries()).forEach(([k, v]) => {
    if (now - v.at > IDEMPOTENCY_TTL_MS) idempotencySeen.delete(k);
  });
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

export async function postIngest(request: Request): Promise<Response> {
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
    const parsed = parseIngestBody(body);
    if (!parsed.ok) {
      return NextResponse.json(
        {
          error: 'Validation failed',
          message: parsed.message,
          field: parsed.field,
          index: parsed.index,
          details: parsed.details,
        },
        { status: 400 }
      );
    }
    const validated = parsed.events;
    if (validated.length === 0) {
      return NextResponse.json({ ok: true, ingested: 0, alerts: 0 });
    }

    await persistEvents(validated);
    const alerts = await runDetections(validated);
    runRetentionCleanup();

    const highOrCritical = alerts.filter((a) => a.severity === 'high' || a.severity === 'critical');
    if (highOrCritical.length > 0) {
      await sendWebhook(
        highOrCritical.map((a) => ({ severity: a.severity, title: a.title, description: a.description }))
      );
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

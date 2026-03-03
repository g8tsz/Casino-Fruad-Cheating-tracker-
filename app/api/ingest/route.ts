/**
 * Ingest endpoint for website casinos. POST an array of events (bets, wins, requests, etc.).
 * Detection runs on ingest; supports live data from any platform that can send JSON.
 */
import { NextResponse } from 'next/server';
import { persistEvents } from '@/lib/store';
import { runDetections } from '@/lib/detection';
import type { CasinoEvent } from '@/lib/types';

function normalizeEvent(raw: Record<string, unknown>): CasinoEvent | null {
  const type = raw.type as string;
  if (!['bet', 'win', 'request', 'session_start', 'session_end', 'chip_move'].includes(type))
    return null;
  return {
    type: type as CasinoEvent['type'],
    playerId: raw.playerId as string | undefined,
    sessionId: raw.sessionId as string | undefined,
    gameId: raw.gameId as string | undefined,
    tableId: raw.tableId as string | undefined,
    amount: typeof raw.amount === 'number' ? raw.amount : undefined,
    timestamp: (raw.timestamp as string) || new Date().toISOString(),
    statusCode: typeof raw.statusCode === 'number' ? raw.statusCode : undefined,
    path: raw.path as string | undefined,
    method: raw.method as string | undefined,
    responseTimeMs: typeof raw.responseTimeMs === 'number' ? raw.responseTimeMs : undefined,
    expectedRtp: typeof raw.expectedRtp === 'number' ? raw.expectedRtp : undefined,
    fromPlayerId: raw.fromPlayerId as string | undefined,
    toPlayerId: raw.toPlayerId as string | undefined,
  };
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const rawList = Array.isArray(body.events) ? body.events : Array.isArray(body) ? body : [];
    const events = rawList.map((r: Record<string, unknown>) => normalizeEvent(r)).filter(Boolean) as CasinoEvent[];
    if (events.length === 0) {
      return NextResponse.json({ ok: true, ingested: 0, alerts: [] });
    }
    await persistEvents(events);
    const alerts = await runDetections(events);
    return NextResponse.json({ ok: true, ingested: events.length, alerts: alerts.length });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: 'Ingest failed' }, { status: 400 });
  }
}

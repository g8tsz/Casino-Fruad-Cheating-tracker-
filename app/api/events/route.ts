import { NextResponse } from 'next/server';
import { getRecentEvents } from '@/lib/store';
import type { EventFilters } from '@/lib/store';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const limit = Math.min(parseInt(searchParams.get('limit') || '100', 10), 500);
  const filters: EventFilters = {};
  const type = searchParams.get('type');
  if (type) filters.type = type;
  const playerId = searchParams.get('playerId');
  if (playerId) filters.playerId = playerId;
  const sessionId = searchParams.get('sessionId');
  if (sessionId) filters.sessionId = sessionId;
  const from = searchParams.get('from');
  if (from) filters.from = from;
  const to = searchParams.get('to');
  if (to) filters.to = to;
  try {
    const events = getRecentEvents(limit, Object.keys(filters).length ? filters : undefined);
    return NextResponse.json(events);
  } catch (e) {
    return NextResponse.json({ error: 'Failed to load events' }, { status: 500 });
  }
}

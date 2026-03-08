import { NextResponse } from 'next/server';
import { getAlerts, acknowledgeAlert } from '@/lib/store';
import type { AlertFilters } from '@/lib/store';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const limit = Math.min(parseInt(searchParams.get('limit') || '100', 10), 500);
  const filters: AlertFilters = {};
  const type = searchParams.get('type');
  if (type) filters.type = type;
  const severity = searchParams.get('severity');
  if (severity) filters.severity = severity;
  const playerId = searchParams.get('playerId');
  if (playerId) filters.playerId = playerId;
  const ack = searchParams.get('acknowledged');
  if (ack !== null && ack !== undefined && ack !== '') filters.acknowledged = ack === 'true';
  const from = searchParams.get('from');
  if (from) filters.from = from;
  const to = searchParams.get('to');
  if (to) filters.to = to;
  try {
    const alerts = getAlerts(limit, Object.keys(filters).length ? filters : undefined);
    return NextResponse.json(alerts);
  } catch (e) {
    return NextResponse.json({ error: 'Failed to load alerts' }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const body = await request.json();
    const id = body.id as string;
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });
    acknowledgeAlert(id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: 'Failed to acknowledge' }, { status: 500 });
  }
}

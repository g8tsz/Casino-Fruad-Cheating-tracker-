import { NextResponse } from 'next/server';
import { getAlerts, getRecentEvents } from '@/lib/store';

/** GET /api/export?alerts=1&events=1&limit=500 - download alerts and/or events as JSON */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const alertsLimit = Math.min(parseInt(searchParams.get('alerts') || '0', 10) || 1000, 2000);
  const eventsLimit = Math.min(parseInt(searchParams.get('events') || '0', 10) || 500, 2000);
  const includeAlerts = searchParams.get('alerts') !== '0' && searchParams.get('alerts') !== '';
  const includeEvents = searchParams.get('events') !== '0' && searchParams.get('events') !== '';
  try {
    const payload: { exportedAt: string; alerts?: unknown[]; events?: unknown[] } = {
      exportedAt: new Date().toISOString(),
    };
    if (includeAlerts) payload.alerts = getAlerts(alertsLimit);
    if (includeEvents) payload.events = getRecentEvents(eventsLimit);
    return new NextResponse(JSON.stringify(payload, null, 2), {
      headers: {
        'Content-Type': 'application/json',
        'Content-Disposition': `attachment; filename="casino-tracker-export-${new Date().toISOString().slice(0, 10)}.json"`,
      },
    });
  } catch (e) {
    return NextResponse.json({ error: 'Export failed' }, { status: 500 });
  }
}

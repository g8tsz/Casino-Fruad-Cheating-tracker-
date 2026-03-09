import { NextResponse } from 'next/server';
import { getAlerts, getRecentEvents } from '@/lib/store';

/** GET /api/export/digest?date=YYYY-MM-DD - daily digest (alerts + event count for the day). Default: today. */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  let dateStr = searchParams.get('date');
  if (!dateStr) {
    const d = new Date();
    dateStr = d.toISOString().slice(0, 10);
  }
  const dayStart = `${dateStr}T00:00:00.000Z`;
  const dayEnd = `${dateStr}T23:59:59.999Z`;

  try {
    const alerts = getAlerts(500, { from: dayStart, to: dayEnd });
    const events = getRecentEvents(1000, { from: dayStart, to: dayEnd });
    const byType = alerts.reduce((acc: Record<string, number>, a) => {
      acc[a.type] = (acc[a.type] ?? 0) + 1;
      return acc;
    }, {});
    const digest = {
      date: dateStr,
      generatedAt: new Date().toISOString(),
      alertsCount: alerts.length,
      eventsCount: events.length,
      alertsByType: byType,
      unacknowledgedAlerts: alerts.filter((a) => !a.acknowledged).length,
      sampleAlertIds: alerts.slice(0, 10).map((a) => a.id),
    };
    return NextResponse.json(digest);
  } catch (e) {
    return NextResponse.json({ error: 'Digest failed' }, { status: 500 });
  }
}

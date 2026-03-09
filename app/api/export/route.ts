import { NextResponse } from 'next/server';
import { getAlerts, getRecentEvents } from '@/lib/store';

function toCsvRow(obj: Record<string, unknown>): string {
  return Object.values(obj).map((v) => {
    const s = String(v ?? '');
    return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s;
  }).join(',');
}

/** GET /api/export?alerts=1&events=1&format=json|csv - download alerts and/or events as JSON or CSV */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const alertsLimit = Math.min(parseInt(searchParams.get('alerts') || '0', 10) || 1000, 2000);
  const eventsLimit = Math.min(parseInt(searchParams.get('events') || '0', 10) || 500, 2000);
  const format = (searchParams.get('format') || 'json').toLowerCase();
  const includeAlerts = searchParams.get('alerts') !== '0' && searchParams.get('alerts') !== '';
  const includeEvents = searchParams.get('events') !== '0' && searchParams.get('events') !== '';
  try {
    if (format === 'csv') {
      const lines: string[] = [];
      const exportedAt = new Date().toISOString();
      if (includeAlerts) {
        const alerts = getAlerts(alertsLimit);
        const alertHeaders = ['id', 'type', 'severity', 'title', 'description', 'timestamp', 'playerId', 'sessionId', 'acknowledged'];
        lines.push(alertHeaders.join(','));
        for (const a of alerts) {
          lines.push(toCsvRow({
            id: a.id,
            type: a.type,
            severity: a.severity,
            title: a.title,
            description: a.description,
            timestamp: a.timestamp,
            playerId: a.playerId ?? '',
            sessionId: a.sessionId ?? '',
            acknowledged: a.acknowledged,
          }));
        }
      }
      if (includeEvents) {
        if (lines.length > 0) lines.push('');
        const events = getRecentEvents(eventsLimit);
        const eventHeaders = ['type', 'playerId', 'sessionId', 'amount', 'timestamp', 'statusCode', 'gameId', 'tableId'];
        lines.push(eventHeaders.join(','));
        for (const e of events) {
          lines.push(toCsvRow({
            type: e.type,
            playerId: e.playerId ?? '',
            sessionId: e.sessionId ?? '',
            amount: e.amount ?? '',
            timestamp: e.timestamp,
            statusCode: e.statusCode ?? '',
            gameId: e.gameId ?? '',
            tableId: e.tableId ?? '',
          }));
        }
      }
      return new NextResponse(lines.join('\n'), {
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="casino-tracker-export-${exportedAt.slice(0, 10)}.csv"`,
        },
      });
    }

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

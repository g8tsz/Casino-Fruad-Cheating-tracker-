import { NextResponse } from 'next/server';
import { getAlerts, getWatchList, getRecentEvents } from '@/lib/store';
import type { FraudStats, FraudType } from '@/lib/types';

const FRAUD_TYPES: FraudType[] = [
  'collusion', 'card_counting', 'slot_tampering', 'meter_anomaly', 'capping',
  'chip_passing', 'bad_request', 'odd_percentage', 'rate_abuse', 'session_anomaly',
];

function parseRange(range: string | null): number {
  if (!range) return 24 * 60 * 60 * 1000;
  const n = parseInt(range, 10);
  if (range.endsWith('d') && !isNaN(n)) return n * 24 * 60 * 60 * 1000;
  if (range.endsWith('h') && !isNaN(n)) return n * 60 * 60 * 1000;
  if (!isNaN(n)) return n * 60 * 60 * 1000; // default hours
  return 24 * 60 * 60 * 1000;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const rangeMs = parseRange(searchParams.get('range') || '24h');
  try {
    const alerts = getAlerts(500);
    const watchList = getWatchList(true);
    const events = getRecentEvents(500);
    const since = Date.now() - rangeMs;
    const alertsInRange = alerts.filter((a) => new Date(a.timestamp).getTime() > since);
    const byType = FRAUD_TYPES.reduce((acc, t) => {
      acc[t] = alertsInRange.filter((a) => a.type === t).length;
      return acc;
    }, {} as Record<FraudType, number>);
    const requests = events.filter((e) => e.type === 'request');
    const badRequests = events.filter((e) => e.type === 'request' && (e.statusCode ?? 0) >= 400);
    const badRequestRate = requests.length > 0 ? badRequests.length / requests.length : 0;
    const oddPctCount = alertsInRange.filter((a) => a.type === 'odd_percentage').length;
    const stats: FraudStats = {
      alertsLast24h: alertsInRange.length,
      byType,
      badRequestRate: Math.round(badRequestRate * 1000) / 10,
      oddPercentageCount: oddPctCount,
      watchListCount: watchList.length,
    };
    return NextResponse.json(stats);
  } catch (e) {
    return NextResponse.json({ error: 'Failed to load stats' }, { status: 500 });
  }
}

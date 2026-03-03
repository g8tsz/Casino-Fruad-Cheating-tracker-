import { NextResponse } from 'next/server';
import { getAlerts, getWatchList, getRecentEvents } from '@/lib/store';
import type { FraudStats, FraudType } from '@/lib/types';

const FRAUD_TYPES: FraudType[] = [
  'collusion', 'card_counting', 'slot_tampering', 'meter_anomaly', 'capping',
  'chip_passing', 'bad_request', 'odd_percentage', 'rate_abuse', 'session_anomaly',
];

export async function GET() {
  try {
    const alerts = getAlerts(500);
    const watchList = getWatchList(true);
    const events = getRecentEvents(500);
    const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
    const alerts24h = alerts.filter((a) => new Date(a.timestamp).getTime() > oneDayAgo);
    const byType = FRAUD_TYPES.reduce((acc, t) => {
      acc[t] = alerts24h.filter((a) => a.type === t).length;
      return acc;
    }, {} as Record<FraudType, number>);
    const requests = events.filter((e) => e.type === 'request');
    const badRequests = events.filter((e) => e.type === 'request' && (e.statusCode ?? 0) >= 400);
    const badRequestRate = requests.length > 0 ? badRequests.length / requests.length : 0;
    const oddPctCount = alerts24h.filter((a) => a.type === 'odd_percentage').length;
    const stats: FraudStats = {
      alertsLast24h: alerts24h.length,
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

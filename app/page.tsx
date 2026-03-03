'use client';

import { useEffect, useState } from 'react';
import { format } from 'date-fns';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts';
import type { FraudAlert, FraudStats, WatchListEntry, CasinoEvent } from '@/lib/types';

const SEVERITY_COLORS: Record<string, string> = {
  critical: '#ef4444',
  high: '#f59e0b',
  medium: '#eab308',
  low: '#6b7280',
};

const TYPE_LABELS: Record<string, string> = {
  collusion: 'Collusion',
  card_counting: 'Card counting',
  slot_tampering: 'Slot tampering',
  meter_anomaly: 'Meter anomaly',
  capping: 'Capping',
  chip_passing: 'Chip passing',
  bad_request: 'Bad request',
  odd_percentage: 'Odd %',
  rate_abuse: 'Rate abuse',
  session_anomaly: 'Session anomaly',
};

export default function Dashboard() {
  const [alerts, setAlerts] = useState<FraudAlert[]>([]);
  const [stats, setStats] = useState<FraudStats | null>(null);
  const [watchList, setWatchList] = useState<WatchListEntry[]>([]);
  const [events, setEvents] = useState<CasinoEvent[]>([]);
  const [watchValue, setWatchValue] = useState('');
  const [watchReason, setWatchReason] = useState('');
  const [loading, setLoading] = useState(true);

  const load = () => {
    Promise.all([
      fetch('/api/alerts?limit=50').then((r) => r.json()),
      fetch('/api/stats').then((r) => r.json()),
      fetch('/api/watchlist').then((r) => r.json()),
      fetch('/api/events?limit=80').then((r) => r.json()),
    ])
      .then(([a, s, w, e]) => {
        setAlerts(a);
        setStats(s);
        setWatchList(w);
        setEvents(e);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    const t = setInterval(load, 15000);
    return () => clearInterval(t);
  }, []);

  const acknowledge = async (id: string) => {
    await fetch('/api/alerts', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) });
    load();
  };

  const addWatch = async () => {
    if (!watchValue.trim()) return;
    await fetch('/api/watchlist', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind: 'player', value: watchValue.trim(), reason: watchReason.trim() || 'Manual' }),
    });
    setWatchValue('');
    setWatchReason('');
    load();
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-zinc-400">Loading...</div>
      </div>
    );
  }

  const chartData = stats ? Object.entries(stats.byType).filter(([, v]) => v > 0).map(([name, value]) => ({ name: TYPE_LABELS[name] || name, value })) : [];

  return (
    <div className="min-h-screen p-6">
      <header className="mb-6 flex items-center justify-between border-b border-zinc-800 pb-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white">
            Casino Fraud & Cheating Tracker
          </h1>
          <p className="mt-1 text-sm text-zinc-400">
            Odd %, bad requests, RTP, collusion, capping • Live data via POST /api/ingest
          </p>
        </div>
        <div className="flex items-center gap-2 rounded-lg bg-zinc-900 px-3 py-2 text-sm text-zinc-300">
          <span className="h-2 w-2 rounded-full bg-green-500 animate-pulse" /> Live
        </div>
      </header>

      {/* Stats */}
      <section className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4 lg:grid-cols-6">
        <div className="card">
          <p className="text-sm text-zinc-400">Alerts (24h)</p>
          <p className="text-xl font-semibold text-white">{stats?.alertsLast24h ?? 0}</p>
        </div>
        <div className="card">
          <p className="text-sm text-zinc-400">Bad request rate %</p>
          <p className="text-xl font-semibold text-amber-400">{stats?.badRequestRate ?? 0}%</p>
        </div>
        <div className="card">
          <p className="text-sm text-zinc-400">Odd % alerts</p>
          <p className="text-xl font-semibold text-red-400">{stats?.oddPercentageCount ?? 0}</p>
        </div>
        <div className="card">
          <p className="text-sm text-zinc-400">Watch list</p>
          <p className="text-xl font-semibold text-white">{stats?.watchListCount ?? 0}</p>
        </div>
        <div className="card col-span-2">
          <p className="text-sm text-zinc-400">Ingest</p>
          <p className="text-sm text-zinc-300">POST /api/ingest with &#123; events: [...] &#125;</p>
        </div>
      </section>

      {/* Alerts by type chart */}
      {chartData.length > 0 && (
        <div className="card mb-6">
          <h2 className="mb-4 text-lg font-semibold text-white">Alerts by type (24h)</h2>
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} layout="vertical" margin={{ left: 80 }}>
                <XAxis type="number" stroke="#71717a" fontSize={12} />
                <YAxis type="category" dataKey="name" stroke="#71717a" fontSize={11} width={75} />
                <Tooltip contentStyle={{ backgroundColor: '#27272a', border: '1px solid #3f3f46' }} />
                <Bar dataKey="value" fill="#f59e0b" radius={[0, 4, 4, 0]}>
                  {chartData.map((_, i) => (
                    <Cell key={i} fill={['#ef4444', '#f59e0b', '#eab308'][i % 3]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Fraud alerts */}
        <div className="card">
          <h2 className="mb-4 text-lg font-semibold text-white">Fraud & cheating alerts</h2>
          <ul className="max-h-96 space-y-2 overflow-y-auto">
            {alerts.length === 0 && (
              <li className="text-sm text-zinc-500">No alerts yet. Send events to /api/ingest.</li>
            )}
            {alerts.map((a) => (
              <li
                key={a.id}
                className={`rounded-lg border p-3 text-sm ${
                  a.severity === 'critical' ? 'badge-critical' : a.severity === 'high' ? 'badge-high' : a.severity === 'medium' ? 'badge-medium' : 'badge-low'
                } ${a.acknowledged ? 'opacity-60' : ''}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <span className="rounded px-1.5 py-0.5 text-xs font-medium" style={{ backgroundColor: SEVERITY_COLORS[a.severity] + '40', color: SEVERITY_COLORS[a.severity] }}>
                      {a.severity}
                    </span>
                    <span className="ml-2 text-xs text-zinc-500">{TYPE_LABELS[a.type] ?? a.type}</span>
                    <h3 className="mt-1 font-medium text-white">{a.title}</h3>
                    <p className="mt-0.5 text-zinc-400">{a.description}</p>
                    {a.suggestedAction && <p className="mt-1 text-amber-200/90 text-xs">→ {a.suggestedAction}</p>}
                    <p className="mt-1 text-xs text-zinc-500">{format(new Date(a.timestamp), 'PPp')}</p>
                  </div>
                  {!a.acknowledged && (
                    <button onClick={() => acknowledge(a.id)} className="shrink-0 rounded bg-zinc-700 px-2 py-1 text-xs hover:bg-zinc-600">
                      Ack
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </div>

        {/* Watch list + recent events */}
        <div className="space-y-6">
          <div className="card">
            <h2 className="mb-4 text-lg font-semibold text-white">Watch list</h2>
            <div className="mb-3 flex gap-2">
              <input
                type="text"
                placeholder="Player / session / table ID"
                value={watchValue}
                onChange={(e) => setWatchValue(e.target.value)}
                className="flex-1 rounded border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-white placeholder-zinc-500"
              />
              <input
                type="text"
                placeholder="Reason"
                value={watchReason}
                onChange={(e) => setWatchReason(e.target.value)}
                className="w-28 rounded border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-white placeholder-zinc-500"
              />
              <button onClick={addWatch} className="rounded bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-500">
                Add
              </button>
            </div>
            <ul className="max-h-40 space-y-1 overflow-y-auto text-sm">
              {watchList.length === 0 && <li className="text-zinc-500">Empty</li>}
              {watchList.map((w) => (
                <li key={w.id} className="flex justify-between rounded bg-zinc-800/50 px-2 py-1.5">
                  <span className="text-white">{w.kind}: {w.value}</span>
                  <span className="text-zinc-500">{w.reason}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="card">
            <h2 className="mb-4 text-lg font-semibold text-white">Recent events</h2>
            <ul className="max-h-64 space-y-1 overflow-y-auto text-xs">
              {events.length === 0 && <li className="text-zinc-500">No events. POST to /api/ingest.</li>}
              {events.slice(0, 50).map((e, i) => (
                <li key={i} className="flex justify-between gap-2 rounded bg-zinc-800/50 px-2 py-1">
                  <span className="text-zinc-300">{e.type}</span>
                  {e.playerId && <span className="truncate text-zinc-500">{e.playerId}</span>}
                  {e.statusCode != null && <span className={e.statusCode >= 400 ? 'text-red-400' : 'text-zinc-400'}>{e.statusCode}</span>}
                  <span className="text-zinc-500">{format(new Date(e.timestamp), 'HH:mm:ss')}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}

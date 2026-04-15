'use client';

import { Suspense, useEffect, useState, useCallback, useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { format } from 'date-fns';
import {
  BarChart,
  Bar,
  LineChart,
  Line,
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
  repeated_bet_bot: 'Repeated bet (bot)',
  impossible_win_sequence: 'Impossible win',
  session_length_anomaly: 'Session length',
  time_of_day_anomaly: 'Time-of-day',
  multi_account_ip: 'Multi-account (IP)',
  multi_account_device: 'Multi-account (device)',
};

type TabId = 'overview' | 'alerts' | 'watchlist' | 'events' | 'export';

function DashboardInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const validTabIds = useMemo(
    () => new Set<TabId>(['overview', 'alerts', 'watchlist', 'events', 'export']),
    []
  );

  const [tab, setTab] = useState<TabId>('overview');

  useEffect(() => {
    const p = searchParams.get('tab');
    if (p && validTabIds.has(p as TabId)) {
      setTab((t) => (t === p ? t : (p as TabId)));
    }
  }, [searchParams, validTabIds]);

  const selectTab = useCallback(
    (id: TabId) => {
      setTab(id);
      router.replace(`?tab=${id}`, { scroll: false });
    },
    [router]
  );
  const [alerts, setAlerts] = useState<FraudAlert[]>([]);
  const [stats, setStats] = useState<FraudStats | null>(null);
  const [watchList, setWatchList] = useState<WatchListEntry[]>([]);
  const [events, setEvents] = useState<CasinoEvent[]>([]);
  const [watchValue, setWatchValue] = useState('');
  const [watchReason, setWatchReason] = useState('');
  const [loading, setLoading] = useState(true);
  const [prevAlertCount, setPrevAlertCount] = useState(0);
  const [statsRange, setStatsRange] = useState('24h');
  const [alertsFrom, setAlertsFrom] = useState('');
  const [alertsTo, setAlertsTo] = useState('');
  const [eventsFrom, setEventsFrom] = useState('');
  const [eventsTo, setEventsTo] = useState('');
  const [alertFilterType, setAlertFilterType] = useState('');
  const [alertFilterSeverity, setAlertFilterSeverity] = useState('');
  const [alertShowAck, setAlertShowAck] = useState<boolean | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [eventFilterType, setEventFilterType] = useState('');
  const [config, setConfig] = useState<Record<string, unknown> | null>(null);

  const load = useCallback(() => {
    const range = statsRange === '24h' ? '' : `&range=${statsRange}`;
    const alertParams = new URLSearchParams();
    if (alertFilterType) alertParams.set('type', alertFilterType);
    if (alertFilterSeverity) alertParams.set('severity', alertFilterSeverity);
    if (alertShowAck !== null) alertParams.set('acknowledged', String(alertShowAck));
    if (alertsFrom) alertParams.set('from', alertsFrom.includes('Z') ? alertsFrom : `${alertsFrom}:00.000Z`);
    if (alertsTo) alertParams.set('to', alertsTo.includes('Z') ? alertsTo : `${alertsTo}:59.999Z`);
    const eventParams = new URLSearchParams();
    if (eventFilterType) eventParams.set('type', eventFilterType);
    if (eventsFrom) eventParams.set('from', eventsFrom.includes('Z') ? eventsFrom : `${eventsFrom}:00.000Z`);
    if (eventsTo) eventParams.set('to', eventsTo.includes('Z') ? eventsTo : `${eventsTo}:59.999Z`);
    Promise.all([
      fetch(`/api/alerts?limit=200&${alertParams}`).then((r) => r.json()),
      fetch(`/api/stats?${range}`).then((r) => r.json()),
      fetch('/api/watchlist').then((r) => r.json()),
      fetch(`/api/events?limit=200&${eventParams}`).then((r) => r.json()),
      fetch('/api/config').then((r) => r.json()).catch(() => ({})),
    ])
      .then(([a, s, w, e, c]) => {
        setAlerts(Array.isArray(a) ? a : []);
        setStats(s);
        setWatchList(Array.isArray(w) ? w : []);
        setEvents(Array.isArray(e) ? e : []);
        setConfig(c);
        setPrevAlertCount((prev) => (prev === 0 ? (Array.isArray(a) ? a.length : 0) : prev));
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [statsRange, alertFilterType, alertFilterSeverity, alertShowAck, eventFilterType, alertsFrom, alertsTo, eventsFrom, eventsTo]);

  useEffect(() => {
    load();
    const t = setInterval(load, 8000);
    return () => clearInterval(t);
  }, [load]);

  const newAlertsCount = alerts.length > prevAlertCount ? alerts.length - prevAlertCount : 0;
  useEffect(() => {
    if (alerts.length > 0 && prevAlertCount > 0 && alerts.length > prevAlertCount) {
      setPrevAlertCount(alerts.length);
    }
  }, [alerts.length, prevAlertCount]);

  const acknowledge = async (id: string) => {
    await fetch('/api/alerts', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    });
    load();
  };

  const addWatch = async () => {
    if (!watchValue.trim()) return;
    await fetch('/api/watchlist', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        kind: 'player',
        value: watchValue.trim(),
        reason: watchReason.trim() || 'Manual',
      }),
    });
    setWatchValue('');
    setWatchReason('');
    load();
  };

  const exportJson = () => {
    window.open('/api/export?alerts=1000&events=1000', '_blank');
  };
  const exportCsv = () => {
    window.open('/api/export?alerts=1000&events=1000&format=csv', '_blank');
  };
  const openDigest = () => {
    window.open('/api/export/digest', '_blank');
  };

  const filteredAlerts = searchQuery.trim()
    ? alerts.filter(
        (a) =>
          a.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
          (a.playerId && a.playerId.toLowerCase().includes(searchQuery.toLowerCase())) ||
          (a.sessionId && a.sessionId.toLowerCase().includes(searchQuery.toLowerCase()))
      )
    : alerts;

  const filteredEvents = searchQuery.trim()
    ? events.filter(
        (e) =>
          (e.playerId && e.playerId.toLowerCase().includes(searchQuery.toLowerCase())) ||
          (e.sessionId && e.sessionId?.toString().toLowerCase().includes(searchQuery.toLowerCase())) ||
          e.type.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : events;

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-emerald-500/30 border-t-emerald-500" />
          <span className="text-zinc-400">Loading tracker...</span>
        </div>
      </div>
    );
  }

  const chartData =
    stats && Object.entries(stats.byType).filter(([, v]) => v > 0).length > 0
      ? Object.entries(stats.byType)
          .filter(([, v]) => v > 0)
          .map(([name, value]) => ({ name: TYPE_LABELS[name] || name, value }))
      : [];

  // Alerts over time (bucket by hour for last 24h worth)
  const alertsOverTimeBuckets = (() => {
    const bucketMs = statsRange === '1h' ? 5 * 60 * 1000 : statsRange === '24h' ? 60 * 60 * 1000 : 24 * 60 * 60 * 1000;
    const now = Date.now();
    const windowMs = statsRange === '1h' ? 60 * 60 * 1000 : statsRange === '24h' ? 24 * 60 * 60 * 1000 : (statsRange === '7d' ? 7 : 30) * 24 * 60 * 60 * 1000;
    const start = now - windowMs;
    const buckets: Record<string, number> = {};
    for (const a of alerts) {
      const t = new Date(a.timestamp).getTime();
      if (t < start) continue;
      const key = new Date(Math.floor(t / bucketMs) * bucketMs).toISOString().slice(0, 13);
      buckets[key] = (buckets[key] ?? 0) + 1;
    }
    return Object.entries(buckets).sort(([a], [b]) => a.localeCompare(b)).map(([name, value]) => ({ name: name.replace('T', ' '), value }));
  })();

  // Top flagged players and tables
  const playerCounts: Record<string, number> = {};
  const tableCounts: Record<string, number> = {};
  for (const a of alerts) {
    if (a.playerId) playerCounts[a.playerId] = (playerCounts[a.playerId] ?? 0) + 1;
    if (a.tableId) tableCounts[a.tableId] = (tableCounts[a.tableId] ?? 0) + 1;
  }
  const topPlayers = Object.entries(playerCounts).sort(([, a], [, b]) => b - a).slice(0, 5).map(([name, value]) => ({ name, value }));
  const topTables = Object.entries(tableCounts).sort(([, a], [, b]) => b - a).slice(0, 5).map(([name, value]) => ({ name, value }));

  const tabs: { id: TabId; label: string }[] = [
    { id: 'overview', label: 'Overview' },
    { id: 'alerts', label: `Alerts ${alerts.filter((a) => !a.acknowledged).length ? `(${alerts.filter((a) => !a.acknowledged).length})` : ''}` },
    { id: 'watchlist', label: 'Watch list' },
    { id: 'events', label: 'Events' },
    { id: 'export', label: 'Export & config' },
  ];

  return (
    <div className="min-h-screen p-4 md:p-6">
      <header className="mb-6 flex flex-col gap-4 border-b border-zinc-800 pb-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">
            Casino Fraud & Cheating Tracker
          </h1>
          <p className="mt-1 text-sm text-zinc-400">
            Odd %, bad requests, RTP, collusion, capping • Live data via POST /api/ingest
          </p>
        </div>
        <div className="flex items-center gap-3">
          {newAlertsCount > 0 && (
            <span className="rounded-full bg-amber-500/20 px-2.5 py-0.5 text-xs font-medium text-amber-400 new-alert">
              +{newAlertsCount} new
            </span>
          )}
          <div className="flex items-center gap-2 rounded-lg border border-zinc-700/80 bg-zinc-900/80 px-3 py-2 text-sm text-zinc-300">
            <span className="live-dot" />
            Live
          </div>
        </div>
      </header>

      <nav className="mb-6 flex flex-wrap gap-1 border-b border-zinc-800">
        {tabs.map(({ id, label }) => (
          <button
            key={id}
            onClick={() => selectTab(id)}
            className={`rounded-t-lg border-b-2 px-4 py-2 text-sm transition-colors ${
              tab === id ? 'tab-active' : 'tab-inactive'
            }`}
          >
            {label}
          </button>
        ))}
      </nav>

      {/* Overview */}
      {tab === 'overview' && (
        <>
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <span className="text-sm text-zinc-500">Stats range:</span>
            {['1h', '24h', '7d', '30d'].map((r) => (
              <button
                key={r}
                onClick={() => setStatsRange(r)}
                className={`rounded-lg px-3 py-1.5 text-sm ${
                  statsRange === r
                    ? 'bg-emerald-500/20 text-emerald-300'
                    : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200'
                }`}
              >
                {r}
              </button>
            ))}
          </div>
          <section className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4 lg:grid-cols-6">
            <div className="card">
              <p className="text-sm text-zinc-400">Alerts</p>
              <p className="text-2xl font-semibold text-white">{stats?.alertsLast24h ?? 0}</p>
            </div>
            <div className="card">
              <p className="text-sm text-zinc-400">Bad request rate %</p>
              <p className="text-2xl font-semibold text-amber-400">{stats?.badRequestRate ?? 0}%</p>
            </div>
            <div className="card">
              <p className="text-sm text-zinc-400">Odd % alerts</p>
              <p className="text-2xl font-semibold text-red-400">{stats?.oddPercentageCount ?? 0}</p>
            </div>
            <div className="card">
              <p className="text-sm text-zinc-400">Watch list</p>
              <p className="text-2xl font-semibold text-white">{stats?.watchListCount ?? 0}</p>
            </div>
            <div className="card col-span-2">
              <p className="text-sm text-zinc-400">Ingest</p>
              <p className="text-sm text-zinc-300">POST /api/ingest with &#123; events: [...] &#125;</p>
            </div>
          </section>
          {chartData.length > 0 && (
            <div className="card mb-6">
              <h2 className="mb-4 text-lg font-semibold text-white">Alerts by type ({statsRange})</h2>
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData} layout="vertical" margin={{ left: 90 }}>
                    <XAxis type="number" stroke="#71717a" fontSize={12} />
                    <YAxis type="category" dataKey="name" stroke="#71717a" fontSize={11} width={85} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: '#27272a',
                        border: '1px solid #3f3f46',
                        borderRadius: '8px',
                      }}
                    />
                    <Bar dataKey="value" fill="#10b981" radius={[0, 4, 4, 0]}>
                      {chartData.map((_, i) => (
                        <Cell
                          key={i}
                          fill={['#ef4444', '#f59e0b', '#10b981', '#eab308'][i % 4]}
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}
          {alertsOverTimeBuckets.length > 0 && (
            <div className="card mb-6">
              <h2 className="mb-4 text-lg font-semibold text-white">Alerts over time</h2>
              <div className="h-48">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={alertsOverTimeBuckets} margin={{ left: 0, right: 8 }}>
                    <XAxis dataKey="name" stroke="#71717a" fontSize={10} />
                    <YAxis stroke="#71717a" fontSize={12} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: '#27272a',
                        border: '1px solid #3f3f46',
                        borderRadius: '8px',
                      }}
                    />
                    <Line type="monotone" dataKey="value" stroke="#10b981" strokeWidth={2} dot={false} name="Alerts" />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}
          {(topPlayers.length > 0 || topTables.length > 0) && (
            <div className="mb-6 grid gap-4 sm:grid-cols-2">
              {topPlayers.length > 0 && (
                <div className="card">
                  <h2 className="mb-4 text-lg font-semibold text-white">Top flagged players</h2>
                  <div className="h-40">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={topPlayers} layout="vertical" margin={{ left: 60 }}>
                        <XAxis type="number" stroke="#71717a" fontSize={11} />
                        <YAxis type="category" dataKey="name" stroke="#71717a" fontSize={10} width={55} />
                        <Tooltip contentStyle={{ backgroundColor: '#27272a', border: '1px solid #3f3f46', borderRadius: '8px' }} />
                        <Bar dataKey="value" fill="#f59e0b" radius={[0, 4, 4, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              )}
              {topTables.length > 0 && (
                <div className="card">
                  <h2 className="mb-4 text-lg font-semibold text-white">Top flagged tables</h2>
                  <div className="h-40">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={topTables} layout="vertical" margin={{ left: 60 }}>
                        <XAxis type="number" stroke="#71717a" fontSize={11} />
                        <YAxis type="category" dataKey="name" stroke="#71717a" fontSize={10} width={55} />
                        <Tooltip contentStyle={{ backgroundColor: '#27272a', border: '1px solid #3f3f46', borderRadius: '8px' }} />
                        <Bar dataKey="value" fill="#eab308" radius={[0, 4, 4, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* Alerts */}
      {tab === 'alerts' && (
        <div className="card">
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <input
              type="text"
              placeholder="Search alerts, player, session..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="max-w-xs rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-white placeholder-zinc-500"
            />
            <span className="text-xs text-zinc-500">From</span>
            <input
              type="datetime-local"
              value={alertsFrom}
              onChange={(e) => setAlertsFrom(e.target.value)}
              className="rounded-lg border border-zinc-700 bg-zinc-800 px-2 py-1.5 text-sm text-white"
            />
            <span className="text-xs text-zinc-500">To</span>
            <input
              type="datetime-local"
              value={alertsTo}
              onChange={(e) => setAlertsTo(e.target.value)}
              className="rounded-lg border border-zinc-700 bg-zinc-800 px-2 py-1.5 text-sm text-white"
            />
            <button
              onClick={() => {
                const end = new Date();
                const start = new Date(end.getTime() - 60 * 60 * 1000);
                setAlertsFrom(start.toISOString().slice(0, 16));
                setAlertsTo(end.toISOString().slice(0, 16));
              }}
              className="rounded-lg bg-zinc-700 px-2 py-1.5 text-xs text-zinc-300 hover:bg-zinc-600"
            >
              Last hour
            </button>
            <select
              value={alertFilterType}
              onChange={(e) => setAlertFilterType(e.target.value)}
              className="rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-white"
            >
              <option value="">All types</option>
              {Object.entries(TYPE_LABELS).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
            <select
              value={alertFilterSeverity}
              onChange={(e) => setAlertFilterSeverity(e.target.value)}
              className="rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-white"
            >
              <option value="">All severity</option>
              <option value="critical">Critical</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>
            <button
              onClick={() => setAlertShowAck(alertShowAck === false ? null : false)}
              className={`rounded-lg px-3 py-2 text-sm ${
                alertShowAck === false ? 'bg-amber-500/20 text-amber-300' : 'bg-zinc-800 text-zinc-400'
              }`}
            >
              Unack only
            </button>
          </div>
          <ul className="max-h-[70vh] space-y-2 overflow-y-auto">
            {filteredAlerts.length === 0 && (
              <li className="py-8 text-center text-sm text-zinc-500">No alerts match. Send events to /api/ingest.</li>
            )}
            {filteredAlerts.map((a) => (
              <li
                key={a.id}
                className={`rounded-lg border p-3 text-sm ${
                  a.severity === 'critical'
                    ? 'badge-critical'
                    : a.severity === 'high'
                    ? 'badge-high'
                    : a.severity === 'medium'
                    ? 'badge-medium'
                    : 'badge-low'
                } ${a.acknowledged ? 'opacity-60' : ''}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <span
                      className="rounded px-1.5 py-0.5 text-xs font-medium"
                      style={{
                        backgroundColor: SEVERITY_COLORS[a.severity] + '40',
                        color: SEVERITY_COLORS[a.severity],
                      }}
                    >
                      {a.severity}
                    </span>
                    <span className="ml-2 text-xs text-zinc-500">
                      {TYPE_LABELS[a.type] ?? a.type}
                    </span>
                    <h3 className="mt-1 font-medium text-white">{a.title}</h3>
                    <p className="mt-0.5 text-zinc-400">{a.description}</p>
                    {a.suggestedAction && (
                      <p className="mt-1 text-xs text-amber-200/90">→ {a.suggestedAction}</p>
                    )}
                    <p className="mt-1 text-xs text-zinc-500">
                      {format(new Date(a.timestamp), 'PPp')}
                    </p>
                  </div>
                  {!a.acknowledged && (
                    <button
                      onClick={() => acknowledge(a.id)}
                      className="shrink-0 rounded bg-zinc-700 px-2 py-1 text-xs hover:bg-zinc-600"
                    >
                      Ack
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Watch list */}
      {tab === 'watchlist' && (
        <div className="card max-w-2xl">
          <h2 className="mb-4 text-lg font-semibold text-white">Watch list</h2>
          <div className="mb-3 flex flex-wrap gap-2">
            <input
              type="text"
              placeholder="Player / session / table ID"
              value={watchValue}
              onChange={(e) => setWatchValue(e.target.value)}
              className="flex-1 min-w-[180px] rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-white placeholder-zinc-500"
            />
            <input
              type="text"
              placeholder="Reason"
              value={watchReason}
              onChange={(e) => setWatchReason(e.target.value)}
              className="w-32 rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-white placeholder-zinc-500"
            />
            <button
              onClick={addWatch}
              className="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-500"
            >
              Add
            </button>
          </div>
          <ul className="max-h-96 space-y-1 overflow-y-auto text-sm">
            {watchList.length === 0 && <li className="py-4 text-zinc-500">Empty. Add players or sessions to monitor.</li>}
            {watchList.map((w) => (
              <li
                key={w.id}
                className="flex justify-between gap-2 rounded-lg bg-zinc-800/50 px-3 py-2"
              >
                <span className="text-white">
                  {w.kind}: {w.value}
                </span>
                <span className="text-zinc-500">{w.reason}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Events */}
      {tab === 'events' && (
        <div className="card">
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <input
              type="text"
              placeholder="Search player, session, type..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="max-w-xs rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-white placeholder-zinc-500"
            />
            <span className="text-xs text-zinc-500">From</span>
            <input
              type="datetime-local"
              value={eventsFrom}
              onChange={(e) => setEventsFrom(e.target.value)}
              className="rounded-lg border border-zinc-700 bg-zinc-800 px-2 py-1.5 text-sm text-white"
            />
            <span className="text-xs text-zinc-500">To</span>
            <input
              type="datetime-local"
              value={eventsTo}
              onChange={(e) => setEventsTo(e.target.value)}
              className="rounded-lg border border-zinc-700 bg-zinc-800 px-2 py-1.5 text-sm text-white"
            />
            <button
              onClick={() => {
                const end = new Date();
                const start = new Date(end.getTime() - 60 * 60 * 1000);
                setEventsFrom(start.toISOString().slice(0, 16));
                setEventsTo(end.toISOString().slice(0, 16));
              }}
              className="rounded-lg bg-zinc-700 px-2 py-1.5 text-xs text-zinc-300 hover:bg-zinc-600"
            >
              Last hour
            </button>
            <select
              value={eventFilterType}
              onChange={(e) => setEventFilterType(e.target.value)}
              className="rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-white"
            >
              <option value="">All types</option>
              <option value="bet">bet</option>
              <option value="win">win</option>
              <option value="request">request</option>
              <option value="session_start">session_start</option>
              <option value="session_end">session_end</option>
              <option value="chip_move">chip_move</option>
            </select>
          </div>
          <ul className="max-h-[70vh] space-y-1 overflow-y-auto text-xs">
            {filteredEvents.length === 0 && (
              <li className="py-8 text-center text-zinc-500">No events. POST to /api/ingest.</li>
            )}
            {filteredEvents.slice(0, 150).map((e, i) => (
              <li
                key={i}
                className="flex flex-wrap items-center justify-between gap-2 rounded bg-zinc-800/50 px-2 py-1.5"
              >
                <span className="text-zinc-300">{e.type}</span>
                {e.playerId && <span className="truncate text-zinc-400">{e.playerId}</span>}
                {e.amount != null && <span className="text-emerald-400/90">{e.amount}</span>}
                {e.statusCode != null && (
                  <span
                    className={e.statusCode >= 400 ? 'text-red-400' : 'text-zinc-500'}
                  >
                    {e.statusCode}
                  </span>
                )}
                <span className="text-zinc-500">{format(new Date(e.timestamp), 'HH:mm:ss')}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Export & config */}
      {tab === 'export' && (
        <div className="space-y-6 max-w-2xl">
          <div className="card">
            <h2 className="mb-2 text-lg font-semibold text-white">Export</h2>
            <p className="mb-3 text-sm text-zinc-400">
              Download alerts and events as JSON or CSV. Daily digest for scheduled reporting.
            </p>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={exportJson}
                className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500"
              >
                Download JSON
              </button>
              <button
                onClick={exportCsv}
                className="rounded-lg bg-zinc-600 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-500"
              >
                Download CSV
              </button>
              <button
                onClick={openDigest}
                className="rounded-lg bg-zinc-700 px-4 py-2 text-sm font-medium text-zinc-200 hover:bg-zinc-600"
              >
                Daily digest
              </button>
            </div>
            <p className="mt-2 text-xs text-zinc-500">
              GET /api/export?alerts=1000&events=1000&format=json|csv · GET /api/export/digest?date=YYYY-MM-DD
            </p>
          </div>
          <div className="card">
            <h2 className="mb-2 text-lg font-semibold text-white">Config</h2>
            <p className="mb-3 text-sm text-zinc-400">
              Threshold preset and options. Set THRESHOLD_PRESET=strict|normal|lenient and env vars.
            </p>
            <pre className="overflow-x-auto rounded-lg bg-zinc-950/80 p-3 text-xs text-zinc-400">
              {config ? JSON.stringify(config, null, 2) : '—'}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}

export default function Dashboard() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center">
          <div className="flex flex-col items-center gap-4">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-emerald-500/30 border-t-emerald-500" />
            <span className="text-zinc-400">Loading tracker...</span>
          </div>
        </div>
      }
    >
      <DashboardInner />
    </Suspense>
  );
}

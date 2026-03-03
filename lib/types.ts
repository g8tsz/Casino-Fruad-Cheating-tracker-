export type GameType = 'slots' | 'blackjack' | 'roulette' | 'poker' | 'craps' | 'baccarat';

/** Ingested event from a casino website or system */
export interface CasinoEvent {
  type: 'bet' | 'win' | 'request' | 'session_start' | 'session_end' | 'chip_move';
  playerId?: string;
  sessionId?: string;
  gameId?: string;
  tableId?: string;
  amount?: number;
  timestamp: string; // ISO
  /** For request events: HTTP status, path, etc. */
  statusCode?: number;
  path?: string;
  method?: string;
  /** Response time ms – for abuse detection */
  responseTimeMs?: number;
  /** Optional: game RTP or hold % for slots */
  expectedRtp?: number;
  /** For chip_move: from/to player or table */
  fromPlayerId?: string;
  toPlayerId?: string;
}

/** Fraud/cheating alert types */
export type FraudType =
  | 'collusion'
  | 'card_counting'
  | 'slot_tampering'
  | 'meter_anomaly'
  | 'capping'
  | 'chip_passing'
  | 'bad_request'
  | 'odd_percentage'
  | 'rate_abuse'
  | 'session_anomaly';

export type Severity = 'low' | 'medium' | 'high' | 'critical';

export interface FraudAlert {
  id: string;
  type: FraudType;
  severity: Severity;
  title: string;
  description: string;
  timestamp: string;
  playerId?: string;
  sessionId?: string;
  gameId?: string;
  tableId?: string;
  /** e.g. RTP observed vs expected */
  metric?: number;
  expectedRange?: string;
  suggestedAction?: string;
  acknowledged: boolean;
  /** Link to source (e.g. request ID, round ID) */
  sourceId?: string;
}

export interface WatchListEntry {
  id: string;
  kind: 'player' | 'table' | 'session' | 'ip';
  value: string; // playerId, tableId, sessionId, or IP
  reason: string;
  addedAt: string;
  expiresAt?: string;
  active: boolean;
}

export interface FraudStats {
  alertsLast24h: number;
  byType: Record<FraudType, number>;
  badRequestRate: number;
  oddPercentageCount: number;
  watchListCount: number;
}

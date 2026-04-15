import { z } from 'zod';
import type { CasinoEvent } from './types';

export const eventTypes = ['bet', 'win', 'request', 'session_start', 'session_end', 'chip_move'] as const;

const casinoEventBase = z.object({
  type: z.enum(eventTypes),
  timestamp: z.string().optional(),
  playerId: z.string().optional(),
  sessionId: z.string().optional(),
  gameId: z.string().optional(),
  tableId: z.string().optional(),
  amount: z.number().finite().optional(),
  statusCode: z.number().int().min(0).max(599).optional(),
  path: z.string().optional(),
  method: z.string().optional(),
  responseTimeMs: z.number().finite().optional(),
  expectedRtp: z.number().min(0).max(100).optional(),
  fromPlayerId: z.string().optional(),
  toPlayerId: z.string().optional(),
  ip: z.string().optional(),
  deviceId: z.string().optional(),
});

export const casinoEventSchema = casinoEventBase.transform(
  (raw): CasinoEvent => ({
    type: raw.type,
    timestamp: raw.timestamp?.trim() ? raw.timestamp : new Date().toISOString(),
    playerId: raw.playerId,
    sessionId: raw.sessionId,
    gameId: raw.gameId,
    tableId: raw.tableId,
    amount: raw.amount,
    statusCode: raw.statusCode,
    path: raw.path,
    method: raw.method,
    responseTimeMs: raw.responseTimeMs,
    expectedRtp: raw.expectedRtp,
    fromPlayerId: raw.fromPlayerId,
    toPlayerId: raw.toPlayerId,
    ip: raw.ip,
    deviceId: raw.deviceId,
  })
);

export type IngestParseFailure = {
  ok: false;
  message: string;
  field?: string;
  index: number;
  details: z.ZodIssue[];
};

export type IngestParseSuccess = { ok: true; events: CasinoEvent[] };

/** Parse POST JSON body: `{ events: [...] }` or raw array. */
export function parseIngestBody(body: unknown): IngestParseSuccess | IngestParseFailure {
  let rawList: unknown[] = [];
  if (Array.isArray(body)) rawList = body;
  else if (body !== null && typeof body === 'object' && Array.isArray((body as { events?: unknown }).events)) {
    rawList = (body as { events: unknown[] }).events;
  }

  const events: CasinoEvent[] = [];
  for (let i = 0; i < rawList.length; i++) {
    const parsed = casinoEventSchema.safeParse(rawList[i]);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      return {
        ok: false,
        message: issue?.message ?? 'Validation failed',
        field: issue?.path.length ? String(issue.path.join('.')) : undefined,
        index: i,
        details: parsed.error.issues,
      };
    }
    events.push(parsed.data);
  }
  return { ok: true, events };
}

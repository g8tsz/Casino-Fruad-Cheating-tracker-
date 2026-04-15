import { describe, it, expect } from 'vitest';
import { parseIngestBody, casinoEventSchema } from './ingest-schema';

describe('parseIngestBody', () => {
  it('accepts wrapped events array', () => {
    const r = parseIngestBody({
      events: [
        {
          type: 'bet',
          timestamp: '2026-01-01T00:00:00.000Z',
          playerId: 'p1',
          amount: 10,
        },
      ],
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.events).toHaveLength(1);
      expect(r.events[0].type).toBe('bet');
      expect(r.events[0].playerId).toBe('p1');
    }
  });

  it('rejects invalid event type', () => {
    const r = parseIngestBody({ events: [{ type: 'invalid', timestamp: '2026-01-01T00:00:00.000Z' }] });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.index).toBe(0);
      expect(r.message).toBeTruthy();
    }
  });

  it('rejects bad amount', () => {
    const r = parseIngestBody({
      events: [{ type: 'bet', amount: Number.NaN }],
    });
    expect(r.ok).toBe(false);
  });
});

describe('casinoEventSchema', () => {
  it('fills missing timestamp', () => {
    const r = casinoEventSchema.safeParse({ type: 'win', amount: 5 });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.timestamp).toMatch(/\d{4}-\d{2}-\d{2}/);
    }
  });
});

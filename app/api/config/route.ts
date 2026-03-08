import { NextResponse } from 'next/server';

/** GET /api/config - public threshold names (values masked). For dashboard display. */
export async function GET() {
  return NextResponse.json({
    RTP_MIN_PCT: process.env.RTP_MIN_PCT ? '***' : undefined,
    RTP_MAX_PCT: process.env.RTP_MAX_PCT ? '***' : undefined,
    WIN_RATE_SUSPICIOUS_PCT: process.env.WIN_RATE_SUSPICIOUS_PCT ? '***' : undefined,
    BAD_REQUEST_RATE_THRESHOLD: process.env.BAD_REQUEST_RATE_THRESHOLD ? '***' : undefined,
    RATE_ABUSE_PER_MIN: process.env.RATE_ABUSE_PER_MIN ? '***' : undefined,
    INGEST_API_KEY: process.env.INGEST_API_KEY ? 'set' : undefined,
    DATA_SOURCE: process.env.DATA_SOURCE || 'memory',
  });
}

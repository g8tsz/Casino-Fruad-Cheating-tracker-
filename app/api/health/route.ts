import { NextResponse } from 'next/server';

/** Liveness/readiness for orchestrators and load balancers. */
export async function GET() {
  return NextResponse.json({
    ok: true,
    service: 'casino-fraud-cheating-tracker',
    uptimeSec: Math.round(process.uptime()),
    timestamp: new Date().toISOString(),
  });
}

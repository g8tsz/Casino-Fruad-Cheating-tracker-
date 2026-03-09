import { NextResponse } from 'next/server';
import { getAuditLog } from '@/lib/store';

/** GET /api/audit?limit=100 - audit log for watch list and config changes. */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const limit = Math.min(parseInt(searchParams.get('limit') || '100', 10), 500);
  try {
    const log = getAuditLog(limit);
    return NextResponse.json(log);
  } catch (e) {
    return NextResponse.json({ error: 'Failed to load audit log' }, { status: 500 });
  }
}

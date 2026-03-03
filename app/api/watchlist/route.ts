import { NextResponse } from 'next/server';
import { getWatchList, addToWatchList } from '@/lib/store';

export async function GET() {
  try {
    const list = getWatchList(true);
    return NextResponse.json(list);
  } catch (e) {
    return NextResponse.json({ error: 'Failed to load watch list' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const kind = (body.kind as 'player' | 'table' | 'session' | 'ip') || 'player';
    const value = String(body.value ?? '').trim();
    const reason = String(body.reason ?? 'Manual add').trim();
    if (!value) return NextResponse.json({ error: 'value required' }, { status: 400 });
    const entry = addToWatchList({ kind, value, reason, active: true, expiresAt: body.expiresAt });
    return NextResponse.json(entry);
  } catch (e) {
    return NextResponse.json({ error: 'Failed to add to watch list' }, { status: 500 });
  }
}

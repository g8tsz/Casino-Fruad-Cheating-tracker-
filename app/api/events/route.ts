import { NextResponse } from 'next/server';
import { getRecentEvents } from '@/lib/store';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const limit = Math.min(parseInt(searchParams.get('limit') || '100', 10), 200);
  try {
    const events = getRecentEvents(limit);
    return NextResponse.json(events);
  } catch (e) {
    return NextResponse.json({ error: 'Failed to load events' }, { status: 500 });
  }
}

import { NextResponse } from 'next/server';
import { getAlerts, acknowledgeAlert } from '@/lib/store';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const limit = Math.min(parseInt(searchParams.get('limit') || '100', 10), 200);
  try {
    const alerts = getAlerts(limit);
    return NextResponse.json(alerts);
  } catch (e) {
    return NextResponse.json({ error: 'Failed to load alerts' }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const body = await request.json();
    const id = body.id as string;
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });
    acknowledgeAlert(id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: 'Failed to acknowledge' }, { status: 500 });
  }
}

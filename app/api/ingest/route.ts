/**
 * Ingest endpoint for website casinos. POST an array of events (bets, wins, requests, etc.).
 * Idempotency-Key support, validation with clear errors, rate limit, webhook on high/critical alerts.
 * @see postIngest — same handler at POST /api/v1/ingest
 */
import { postIngest } from '@/lib/ingest-handler';

export async function POST(request: Request) {
  return postIngest(request);
}

/**
 * Versioned ingest — stable path for integrations (identical to POST /api/ingest).
 */
import { postIngest } from '@/lib/ingest-handler';

export async function POST(request: Request) {
  return postIngest(request);
}

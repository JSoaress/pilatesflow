import { NextResponse } from 'next/server';
import { cronAuthorized } from '@/lib/cron';
import { dispatchQueuedMessages } from '@/lib/integrations/dispatcher';

export const dynamic = 'force-dynamic';

/** Envia mensagens da fila (executar a cada 5–15 minutos). */
export async function GET(req: Request) {
  if (!cronAuthorized(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const results = await dispatchQueuedMessages(50);
  return NextResponse.json({ processed: results.length, sent: results.filter((r) => r.ok).length });
}

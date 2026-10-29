import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { cronAuthorized } from '@/lib/cron';
import { dispatchQueuedMessages } from '@/lib/integrations/dispatcher';
import { captureException, log } from '@/lib/observability';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/** Rotina diária: vencidos, renovações, recorrências, créditos, automações e fila de mensagens. */
export async function GET(req: Request) {
  if (!cronAuthorized(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const admin = createAdminClient();
  const out: Record<string, unknown> = {};
  for (const [name, fn, args] of [
    ['overdue', 'refresh_overdue', { p_org: null }],
    ['renewed', 'renew_subscriptions', { p_org: null }],
    ['recurrences', 'generate_all_recurrences', { p_org: null }],
    ['credits_expired', 'expire_replacement_credits', {}],
    ['automations', 'run_automations', { p_org: null }],
  ] as const) {
    const { data, error } = await admin.rpc(fn, args as Record<string, unknown>);
    if (error) { captureException(error, { job: name }); out[name] = 'erro'; } else out[name] = data;
  }
  out.messages = (await dispatchQueuedMessages(100)).length;
  log('info', 'cron diário executado', out);
  return NextResponse.json({ ok: true, ...out });
}

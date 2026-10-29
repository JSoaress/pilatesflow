import { NextResponse } from 'next/server';
import crypto from 'node:crypto';
import { createAdminClient } from '@/lib/supabase/admin';
import { getPaymentProvider } from '@/lib/integrations/payments';
import { serverEnv } from '@/lib/env';
import { captureException, log } from '@/lib/observability';

export const dynamic = 'force-dynamic';

/** Verificação do webhook do WhatsApp Cloud API (Meta). */
export async function GET(req: Request, { params }: { params: Promise<{ provider: string }> }) {
  const { provider } = await params;
  const url = new URL(req.url);
  if (provider === 'whatsapp' && url.searchParams.get('hub.mode') === 'subscribe' && url.searchParams.get('hub.verify_token') === serverEnv().whatsapp.webhookVerifyToken && serverEnv().whatsapp.webhookVerifyToken) {
    return new NextResponse(url.searchParams.get('hub.challenge') ?? '', { status: 200 });
  }
  return new NextResponse('Forbidden', { status: 403 });
}

/** Webhooks de pagamento (baixa automática) e status de mensagens do WhatsApp. */
export async function POST(req: Request, { params }: { params: Promise<{ provider: string }> }) {
  const { provider } = await params;
  const raw = await req.text();
  try {
    const admin = createAdminClient();
    if (provider === 'whatsapp') {
      const secret = serverEnv().whatsapp.appSecret;
      const sig = req.headers.get('x-hub-signature-256') ?? '';
      if (!secret) return NextResponse.json({ error: 'not configured' }, { status: 503 });
      const expected = 'sha256=' + crypto.createHmac('sha256', secret).update(raw).digest('hex');
      if (sig.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return NextResponse.json({ error: 'invalid signature' }, { status: 401 });
      const body = JSON.parse(raw);
      for (const entry of body.entry ?? []) for (const ch of entry.changes ?? []) for (const st of ch.value?.statuses ?? []) {
        const map: Record<string, string> = { sent: 'sent', delivered: 'delivered', read: 'read', failed: 'failed' };
        if (map[st.status]) await admin.from('messages').update({ status: map[st.status], error: st.errors?.[0]?.title ?? null }).eq('provider_message_id', st.id);
      }
      return NextResponse.json({ ok: true });
    }
    if (!['asaas', 'mercadopago', 'stripe'].includes(provider)) return NextResponse.json({ error: 'unknown provider' }, { status: 404 });
    const p = getPaymentProvider(provider as 'asaas' | 'mercadopago' | 'stripe');
    let evt;
    try { evt = await p.parseWebhook(req.headers, raw); } catch (e) {
      log('warn', 'webhook rejeitado', { provider, reason: (e as Error).message });
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }
    if (!evt) return NextResponse.json({ ok: true, ignored: true });
    const { data, error } = await admin.rpc('gateway_confirm_payment', {
      p_provider: provider, p_external_id: evt.externalId, p_event_id: evt.eventId, p_status: evt.status, p_amount: evt.amount ?? null,
      p_paid_at: evt.paidAt ?? null, p_external_reference: evt.externalReference ?? null, p_payload: JSON.parse(raw),
    });
    if (error) throw error;
    return NextResponse.json({ ok: true, result: data });
  } catch (e) {
    captureException(e, { where: 'webhook', provider });
    return NextResponse.json({ error: 'internal' }, { status: 500 });
  }
}

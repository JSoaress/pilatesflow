import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import { serverEnv } from '@/lib/env';
import { channelConfigured, sendMessage, type OutMessage } from './messaging';
import { captureException } from '@/lib/observability';

/**
 * Worker da fila de mensagens: reserva mensagens "na fila", envia pelo provedor oficial e
 * registra o resultado (data, destinatário, template, status, erro). Sem integração configurada
 * a mensagem é marcada como "falhou" com o motivo — nunca como enviada.
 */
export async function dispatchQueuedMessages(limit = 20) {
  if (!serverEnv().serviceRoleKey) return [] as { id: string; ok: boolean; error?: string }[];
  const admin = createAdminClient();
  const { data, error } = await admin.rpc('claim_messages', { p_limit: limit });
  if (error) { captureException(error, { where: 'dispatch' }); return []; }
  const out: { id: string; ok: boolean; error?: string }[] = [];
  for (const m of (data ?? []) as { id: string; channel: OutMessage['channel']; to_address: string; subject: string | null; body: string; template_id: string | null }[]) {
    if (!channelConfigured(m.channel)) {
      const msg = `Integração de ${m.channel === 'whatsapp' ? 'WhatsApp' : m.channel === 'email' ? 'e-mail' : m.channel.toUpperCase()} não configurada.`;
      await admin.rpc('fail_message', { p_id: m.id, p_error: msg });
      out.push({ id: m.id, ok: false, error: msg });
      continue;
    }
    let templateName: string | null = null;
    if (m.template_id) {
      const { data: t } = await admin.from('message_templates').select('provider_template_name').eq('id', m.template_id).maybeSingle();
      templateName = (t as { provider_template_name: string | null } | null)?.provider_template_name ?? null;
    }
    const res = await sendMessage({ channel: m.channel, to: m.to_address, subject: m.subject, body: m.body, templateName });
    await admin.rpc('finish_message', { p_id: m.id, p_ok: res.ok, p_provider: res.provider, p_provider_message_id: res.ok ? res.providerMessageId ?? null : null, p_error: res.ok ? null : res.error });
    out.push({ id: m.id, ok: res.ok, error: res.ok ? undefined : res.error });
  }
  return out;
}

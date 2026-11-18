import 'server-only';
import nodemailer from 'nodemailer';
import { serverEnv } from '@/lib/env';

let cachedTransport: ReturnType<typeof nodemailer.createTransport> | null = null;
function emailTransport() {
  const e = serverEnv();
  if (!cachedTransport) {
    cachedTransport = nodemailer.createTransport({
      host: e.email.smtpHost,
      port: e.email.smtpPort,
      secure: e.email.smtpPort === 465,
      auth: { user: e.email.smtpUser, pass: e.email.smtpPass },
      connectionTimeout: 15000,
      socketTimeout: 15000,
    });
  }
  return cachedTransport;
}

/**
 * Envio de mensagens pelos canais oficiais. WhatsApp: somente API oficial (Meta Cloud API).
 * Nada de automação do WhatsApp Web. Sem credenciais, o envio falha com erro explícito.
 */
export type SendResult = { ok: true; providerMessageId?: string; provider: string } | { ok: false; error: string; provider: string };
export type OutMessage = { channel: 'whatsapp' | 'email' | 'sms' | 'push'; to: string; subject?: string | null; body: string; templateName?: string | null; language?: string };

export function channelConfigured(channel: OutMessage['channel']) {
  const e = serverEnv();
  if (channel === 'whatsapp') return !!(e.whatsapp.token && e.whatsapp.phoneNumberId);
  if (channel === 'email') return !!(e.email.smtpHost && e.email.smtpUser && e.email.smtpPass && e.email.from);
  if (channel === 'sms') return !!(e.sms.twilioSid && e.sms.twilioToken && e.sms.twilioFrom);
  return false;
}

function e164(phone: string) {
  let d = phone.replace(/\D/g, '');
  if (d.length <= 11) d = '55' + d;
  return d;
}

export async function sendMessage(msg: OutMessage): Promise<SendResult> {
  const e = serverEnv();
  try {
    if (msg.channel === 'whatsapp') {
      if (!channelConfigured('whatsapp')) return { ok: false, provider: 'whatsapp_cloud', error: 'Integração do WhatsApp não configurada.' };
      const payload = msg.templateName
        ? { messaging_product: 'whatsapp', to: e164(msg.to), type: 'template', template: { name: msg.templateName, language: { code: msg.language ?? 'pt_BR' }, components: [{ type: 'body', parameters: [{ type: 'text', text: msg.body.slice(0, 1000) }] }] } }
        : { messaging_product: 'whatsapp', to: e164(msg.to), type: 'text', text: { body: msg.body.slice(0, 4096) } };
      const res = await fetch(`https://graph.facebook.com/v21.0/${e.whatsapp.phoneNumberId}/messages`, {
        method: 'POST', headers: { Authorization: `Bearer ${e.whatsapp.token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(payload), signal: AbortSignal.timeout(15000),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) return { ok: false, provider: 'whatsapp_cloud', error: j?.error?.message ?? `Erro ${res.status}` };
      return { ok: true, provider: 'whatsapp_cloud', providerMessageId: j?.messages?.[0]?.id };
    }
    if (msg.channel === 'email') {
      if (!channelConfigured('email')) return { ok: false, provider: 'smtp', error: 'Integração de e-mail não configurada.' };
      const info = await emailTransport().sendMail({
        from: e.email.from, to: msg.to, subject: msg.subject ?? 'Mensagem', text: msg.body,
      });
      return { ok: true, provider: 'smtp', providerMessageId: info.messageId };
    }
    if (msg.channel === 'sms') {
      if (!channelConfigured('sms')) return { ok: false, provider: 'twilio', error: 'Integração de SMS não configurada.' };
      const auth = Buffer.from(`${e.sms.twilioSid}:${e.sms.twilioToken}`).toString('base64');
      const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${e.sms.twilioSid}/Messages.json`, {
        method: 'POST', headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ To: '+' + e164(msg.to), From: e.sms.twilioFrom, Body: msg.body.slice(0, 1500) }), signal: AbortSignal.timeout(15000),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) return { ok: false, provider: 'twilio', error: j?.message ?? `Erro ${res.status}` };
      return { ok: true, provider: 'twilio', providerMessageId: j?.sid };
    }
    return { ok: false, provider: 'push', error: 'Notificações push ainda não configuradas.' };
  } catch (err) {
    return { ok: false, provider: msg.channel, error: (err as Error).message };
  }
}

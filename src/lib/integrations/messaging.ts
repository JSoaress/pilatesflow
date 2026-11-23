import 'server-only';
import nodemailer from 'nodemailer';
import { serverEnv } from '@/lib/env';

let cachedTransport: ReturnType<typeof nodemailer.createTransport> | null = null;
function smtpTransport() {
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

export type SendResult = { ok: true; providerMessageId?: string; provider: string } | { ok: false; error: string; provider: string };
export type OutMessage = { channel: 'whatsapp' | 'email' | 'sms' | 'push'; to: string; subject?: string | null; body: string; templateName?: string | null; language?: string };

/**
 * Envio de e-mail "cru": usado tanto pelo canal de mensageria (sendMessage,
 * abaixo) quanto pelo Send Email Hook do GoTrue (src/app/api/auth/email-hook).
 * Prioriza a API HTTP da Brevo — necessária na Railway, que bloqueia as
 * portas SMTP (587/465/25) nos planos Free/Trial/Hobby — e cai para SMTP
 * (Nodemailer) quando só o SMTP estiver configurado (ex.: outro ambiente).
 */
export async function sendTransactionalEmail(to: string, subject: string, text: string, html?: string): Promise<SendResult> {
  const e = serverEnv();
  if (e.email.brevoApiKey) {
    try {
      const res = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: { 'api-key': e.email.brevoApiKey, 'Content-Type': 'application/json', accept: 'application/json' },
        body: JSON.stringify({
          sender: { email: e.email.from, ...(e.email.fromName ? { name: e.email.fromName } : {}) },
          to: [{ email: to }],
          subject,
          textContent: text,
          ...(html ? { htmlContent: html } : {}),
        }),
        signal: AbortSignal.timeout(15000),
      });
      const j = await res.json().catch(() => ({}) as Record<string, unknown>);
      if (!res.ok) return { ok: false, provider: 'brevo', error: (j as { message?: string })?.message ?? `Erro ${res.status}` };
      return { ok: true, provider: 'brevo', providerMessageId: (j as { messageId?: string })?.messageId };
    } catch (err) {
      return { ok: false, provider: 'brevo', error: (err as Error).message };
    }
  }
  if (e.email.smtpHost && e.email.smtpUser && e.email.smtpPass) {
    try {
      const info = await smtpTransport().sendMail({ from: e.email.from, to, subject, text, html });
      return { ok: true, provider: 'smtp', providerMessageId: info.messageId };
    } catch (err) {
      return { ok: false, provider: 'smtp', error: (err as Error).message };
    }
  }
  return { ok: false, provider: 'email', error: 'Nenhum provedor de e-mail configurado (defina BREVO_API_KEY ou SMTP_HOST/SMTP_USER/SMTP_PASS).' };
}

/**
 * Envio de mensagens pelos canais oficiais. WhatsApp: somente API oficial (Meta Cloud API).
 * Nada de automação do WhatsApp Web. Sem credenciais, o envio falha com erro explícito.
 */
export function channelConfigured(channel: OutMessage['channel']) {
  const e = serverEnv();
  if (channel === 'whatsapp') return !!(e.whatsapp.token && e.whatsapp.phoneNumberId);
  if (channel === 'email') return !!(e.email.from && (e.email.brevoApiKey || (e.email.smtpHost && e.email.smtpUser && e.email.smtpPass)));
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
      if (!channelConfigured('email')) return { ok: false, provider: 'email', error: 'Integração de e-mail não configurada.' };
      return await sendTransactionalEmail(msg.to, msg.subject ?? 'Mensagem', msg.body);
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

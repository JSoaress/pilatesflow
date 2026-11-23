import { NextResponse } from 'next/server';
import crypto from 'node:crypto';
import { serverEnv } from '@/lib/env';
import { sendTransactionalEmail } from '@/lib/integrations/messaging';
import { captureException, log } from '@/lib/observability';

export const dynamic = 'force-dynamic';

/**
 * Send Email Hook do GoTrue (Supabase Auth self-hosted).
 * Configurado via GOTRUE_HOOK_SEND_EMAIL_ENABLED/URI/SECRETS — ver
 * docs/railway-deploy-single-container.md. Necessário na Railway porque a
 * plataforma bloqueia as portas SMTP (587/465/25) nos planos Free/Trial/
 * Hobby, então o envio de e-mail embutido do GoTrue nunca chega a sair.
 * O GoTrue assina a requisição no formato Standard Webhooks
 * (https://www.standardwebhooks.com): headers webhook-id/webhook-timestamp/
 * webhook-signature, segredo no formato "v1,whsec_XXXX".
 */

const TOLERANCE_SECONDS = 5 * 60;

function timingSafeEqualStr(a: string, b: string) {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

/** Verifica a assinatura Standard Webhooks contra uma ou mais chaves (rotação). */
function verifySignature(payload: string, id: string, timestamp: string, signatureHeader: string, secrets: string[]) {
  const tsNum = Number(timestamp);
  if (!Number.isFinite(tsNum) || Math.abs(Date.now() / 1000 - tsNum) > TOLERANCE_SECONDS) return false;
  if (!id || !signatureHeader) return false;

  const signedContent = `${id}.${timestamp}.${payload}`;
  const candidates = signatureHeader.split(' ').map((s) => s.trim()).filter(Boolean);

  for (const rawSecret of secrets) {
    const b64Secret = rawSecret.trim().replace(/^v1,whsec_/, '').replace(/^whsec_/, '');
    if (!b64Secret) continue;
    let key: Buffer;
    try {
      key = Buffer.from(b64Secret, 'base64');
    } catch {
      continue;
    }
    const expected = crypto.createHmac('sha256', key).update(signedContent).digest('base64');
    for (const candidate of candidates) {
      const sig = candidate.split(',')[1];
      if (sig && timingSafeEqualStr(sig, expected)) return true;
    }
  }
  return false;
}

type EmailData = {
  token: string;
  token_hash: string;
  token_new?: string;
  token_hash_new?: string;
  redirect_to: string;
  email_action_type: string;
  site_url: string;
};

type HookUser = { email: string; user_metadata?: { full_name?: string } };

function verifyLink(emailData: EmailData, tokenHash: string) {
  const redirect = encodeURIComponent(emailData.redirect_to || emailData.site_url);
  // Prefixo /auth/v1 removido pelo nginx (docker/nginx/*.conf.template) antes
  // de chegar ao GoTrue — ver location /auth/v1/.
  return `${emailData.site_url}/auth/v1/verify?token=${tokenHash}&type=${emailData.email_action_type}&redirect_to=${redirect}`;
}

function buildEmail(user: HookUser, emailData: EmailData): { subject: string; text: string } | null {
  const name = user.user_metadata?.full_name || user.email;
  const type = emailData.email_action_type;

  if (type === 'signup' || type === 'invite' || type === 'magiclink' || type === 'recovery' || type === 'email_change' || type === 'email') {
    const tokenHash = emailData.token_hash_new || emailData.token_hash;
    const link = verifyLink(emailData, tokenHash);
    switch (type) {
      case 'signup':
        return { subject: 'Confirme seu cadastro no PilatesFlow', text: `Olá, ${name}!\n\nConfirme seu e-mail para ativar sua conta:\n${link}\n\nSe você não criou esta conta, ignore este e-mail.` };
      case 'invite':
        return { subject: 'Você foi convidado para o PilatesFlow', text: `Olá, ${name}!\n\nVocê foi convidado a acessar o PilatesFlow. Defina sua senha e aceite o convite:\n${link}` };
      case 'magiclink':
        return { subject: 'Seu link de acesso ao PilatesFlow', text: `Olá, ${name}!\n\nUse o link abaixo para entrar na sua conta:\n${link}\n\nSe você não solicitou este acesso, ignore este e-mail.` };
      case 'recovery':
        return { subject: 'Redefinição de senha — PilatesFlow', text: `Olá, ${name}!\n\nRecebemos uma solicitação para redefinir sua senha. Clique para continuar:\n${link}\n\nSe não foi você, ignore este e-mail — sua senha não será alterada.` };
      case 'email_change':
        return { subject: 'Confirme seu novo e-mail — PilatesFlow', text: `Olá, ${name}!\n\nConfirme a alteração do seu e-mail clicando no link:\n${link}\n\nSe você não solicitou esta alteração, ignore este e-mail.` };
      default:
        return { subject: 'Confirme seu e-mail — PilatesFlow', text: `Olá, ${name}!\n\nConfirme seu endereço de e-mail:\n${link}` };
    }
  }

  if (type === 'reauthentication') {
    return { subject: 'Código de confirmação — PilatesFlow', text: `Olá, ${name}!\n\nUse o código abaixo para confirmar esta ação:\n\n${emailData.token}\n\nSe você não solicitou isso, ignore este e-mail.` };
  }

  const notifications: Record<string, { subject: string; text: string }> = {
    password_changed_notification: { subject: 'Sua senha foi alterada', text: `Olá, ${name}!\n\nSua senha no PilatesFlow foi alterada recentemente. Se não foi você, contate o suporte imediatamente.` },
    email_changed_notification: { subject: 'Seu e-mail foi alterado', text: `Olá, ${name}!\n\nO e-mail da sua conta no PilatesFlow foi alterado recentemente. Se não foi você, contate o suporte imediatamente.` },
    phone_changed_notification: { subject: 'Seu telefone foi alterado', text: `Olá, ${name}!\n\nO telefone da sua conta no PilatesFlow foi alterado recentemente. Se não foi você, contate o suporte imediatamente.` },
    identity_linked_notification: { subject: 'Nova conta vinculada', text: `Olá, ${name}!\n\nUma nova forma de acesso foi vinculada à sua conta no PilatesFlow. Se não foi você, contate o suporte.` },
    identity_unlinked_notification: { subject: 'Conta desvinculada', text: `Olá, ${name}!\n\nUma forma de acesso foi desvinculada da sua conta no PilatesFlow. Se não foi você, contate o suporte.` },
    mfa_factor_enrolled_notification: { subject: 'Autenticação em duas etapas ativada', text: `Olá, ${name}!\n\nA autenticação em duas etapas foi ativada na sua conta no PilatesFlow. Se não foi você, contate o suporte imediatamente.` },
    mfa_factor_unenrolled_notification: { subject: 'Autenticação em duas etapas desativada', text: `Olá, ${name}!\n\nA autenticação em duas etapas foi desativada na sua conta no PilatesFlow. Se não foi você, contate o suporte imediatamente.` },
  };
  return notifications[type] ?? null;
}

export async function POST(req: Request) {
  const payload = await req.text();
  const id = req.headers.get('webhook-id') ?? '';
  const timestamp = req.headers.get('webhook-timestamp') ?? '';
  const signature = req.headers.get('webhook-signature') ?? '';

  const secrets = serverEnv().authEmailHook.secrets.split('|').map((s) => s.trim()).filter(Boolean);
  if (secrets.length === 0) {
    log('error', 'email-hook sem GOTRUE_HOOK_SEND_EMAIL_SECRETS configurado no app');
    return NextResponse.json({ error: { http_code: 500, message: 'Hook não configurado no servidor.' } }, { status: 500 });
  }

  if (!verifySignature(payload, id, timestamp, signature, secrets)) {
    log('warn', 'email-hook: assinatura inválida ou ausente');
    return NextResponse.json({ error: { http_code: 401, message: 'Assinatura inválida.' } }, { status: 401 });
  }

  let body: { user: HookUser; email_data: EmailData };
  try {
    body = JSON.parse(payload);
  } catch {
    return NextResponse.json({ error: { http_code: 400, message: 'JSON inválido.' } }, { status: 400 });
  }

  const { user, email_data } = body;
  if (!user?.email || !email_data?.email_action_type) {
    return NextResponse.json({ error: { http_code: 400, message: 'Payload incompleto.' } }, { status: 400 });
  }

  const content = buildEmail(user, email_data);
  if (!content) {
    // Tipo de e-mail ainda não mapeado: não bloqueia o fluxo de auth, só não envia e-mail.
    log('warn', 'email-hook: email_action_type não tratado', { email_action_type: email_data.email_action_type });
    return NextResponse.json({});
  }

  const result = await sendTransactionalEmail(user.email, content.subject, content.text);
  if (!result.ok) {
    captureException(new Error(result.error), { where: 'email-hook', email_action_type: email_data.email_action_type, provider: result.provider });
    return NextResponse.json({ error: { http_code: 500, message: 'Falha ao enviar o e-mail.' } }, { status: 500 });
  }

  return NextResponse.json({});
}

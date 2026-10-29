import 'server-only';
import crypto from 'node:crypto';
import { serverEnv } from '@/lib/env';

/**
 * Camada desacoplada de provedores de pagamento brasileiros.
 * Nunca recebe nem armazena dados de cartão: o pagamento com cartão ocorre na
 * página segura do provedor (link de pagamento/checkout).
 */
export type ChargeInput = {
  amount: number; dueDate: string; description: string; method: 'pix' | 'boleto' | 'link'; externalReference: string;
  customer: { name: string; email?: string | null; phone?: string | null; cpf?: string | null };
};
export type ChargeResult = { externalId: string; pixCopyPaste?: string; pixQrImage?: string; paymentUrl?: string; raw?: unknown };
export type WebhookPayment = { externalId: string; eventId: string; status: 'paid' | 'pending' | 'cancelled' | 'refunded'; amount?: number; paidAt?: string; externalReference?: string };

export interface PaymentProvider {
  id: 'asaas' | 'mercadopago' | 'stripe';
  isConfigured(): boolean;
  createCharge(input: ChargeInput): Promise<ChargeResult>;
  /** Valida a assinatura do webhook e normaliza o evento. Retorna null para eventos irrelevantes. */
  parseWebhook(headers: Headers, rawBody: string): Promise<WebhookPayment | null>;
}

class ProviderError extends Error {}

async function http(url: string, init: RequestInit) {
  const res = await fetch(url, { ...init, signal: AbortSignal.timeout(15000) });
  const text = await res.text();
  let body: any = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = text; }
  if (!res.ok) throw new ProviderError(`Provedor respondeu ${res.status}: ${typeof body === 'string' ? body.slice(0, 200) : JSON.stringify(body).slice(0, 300)}`);
  return body;
}

// ------------------------------------------------------------------ Asaas
const asaas: PaymentProvider = {
  id: 'asaas',
  isConfigured: () => !!serverEnv().asaas.apiKey,
  async createCharge(input) {
    const { apiKey, baseUrl } = serverEnv().asaas;
    const headers = { 'Content-Type': 'application/json', access_token: apiKey, 'User-Agent': 'PilatesFlow' };
    const customer = await http(`${baseUrl}/customers`, { method: 'POST', headers, body: JSON.stringify({
      name: input.customer.name, email: input.customer.email ?? undefined, mobilePhone: input.customer.phone?.replace(/\D/g, '') || undefined,
      cpfCnpj: input.customer.cpf?.replace(/\D/g, '') || undefined, externalReference: input.externalReference,
    }) });
    const payment = await http(`${baseUrl}/payments`, { method: 'POST', headers, body: JSON.stringify({
      customer: customer.id, billingType: input.method === 'pix' ? 'PIX' : input.method === 'boleto' ? 'BOLETO' : 'UNDEFINED',
      value: input.amount, dueDate: input.dueDate, description: input.description.slice(0, 500), externalReference: input.externalReference,
    }) });
    const out: ChargeResult = { externalId: payment.id, paymentUrl: payment.invoiceUrl ?? payment.bankSlipUrl, raw: { id: payment.id, status: payment.status } };
    if (input.method === 'pix') {
      const qr = await http(`${baseUrl}/payments/${payment.id}/pixQrCode`, { headers });
      out.pixCopyPaste = qr.payload;
      out.pixQrImage = qr.encodedImage ? `data:image/png;base64,${qr.encodedImage}` : undefined;
    }
    return out;
  },
  async parseWebhook(headers, rawBody) {
    const token = serverEnv().asaas.webhookToken;
    if (!token || headers.get('asaas-access-token') !== token) throw new ProviderError('Webhook Asaas não autenticado.');
    const evt = JSON.parse(rawBody);
    const p = evt.payment;
    if (!p) return null;
    const map: Record<string, WebhookPayment['status']> = { PAYMENT_RECEIVED: 'paid', PAYMENT_CONFIRMED: 'paid', PAYMENT_REFUNDED: 'refunded', PAYMENT_DELETED: 'cancelled' };
    const status = map[evt.event];
    if (!status) return null;
    return { externalId: p.id, eventId: evt.id ?? `${evt.event}:${p.id}`, status, amount: Number(p.value), paidAt: p.clientPaymentDate ?? p.paymentDate, externalReference: p.externalReference };
  },
};

// ------------------------------------------------------------------ Mercado Pago
const mercadopago: PaymentProvider = {
  id: 'mercadopago',
  isConfigured: () => !!serverEnv().mercadopago.accessToken,
  async createCharge(input) {
    const token = serverEnv().mercadopago.accessToken;
    const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, 'X-Idempotency-Key': `${input.externalReference}-${input.method}` };
    if (input.method === 'pix') {
      const p = await http('https://api.mercadopago.com/v1/payments', { method: 'POST', headers, body: JSON.stringify({
        transaction_amount: input.amount, description: input.description.slice(0, 250), payment_method_id: 'pix', external_reference: input.externalReference,
        payer: { email: input.customer.email || 'sem-email@exemplo.com', first_name: input.customer.name.split(' ')[0] },
        date_of_expiration: new Date(`${input.dueDate}T23:59:59-03:00`).toISOString(),
      }) });
      const td = p.point_of_interaction?.transaction_data ?? {};
      return { externalId: String(p.id), pixCopyPaste: td.qr_code, pixQrImage: td.qr_code_base64 ? `data:image/png;base64,${td.qr_code_base64}` : undefined, paymentUrl: td.ticket_url, raw: { id: p.id, status: p.status } };
    }
    const pref = await http('https://api.mercadopago.com/checkout/preferences', { method: 'POST', headers, body: JSON.stringify({
      items: [{ title: input.description.slice(0, 250), quantity: 1, unit_price: input.amount, currency_id: 'BRL' }],
      external_reference: input.externalReference,
    }) });
    return { externalId: `pref:${pref.id}`, paymentUrl: pref.init_point, raw: { id: pref.id } };
  },
  async parseWebhook(headers, rawBody) {
    const secret = serverEnv().mercadopago.webhookSecret;
    const evt = JSON.parse(rawBody);
    const dataId = String(evt?.data?.id ?? '');
    if (!dataId) return null;
    if (secret) {
      const sig = headers.get('x-signature') ?? '';
      const reqId = headers.get('x-request-id') ?? '';
      const parts = Object.fromEntries(sig.split(',').map((kv) => kv.trim().split('=') as [string, string]));
      const manifest = `id:${dataId};request-id:${reqId};ts:${parts.ts};`;
      const hmac = crypto.createHmac('sha256', secret).update(manifest).digest('hex');
      if (!parts.v1 || !crypto.timingSafeEqual(Buffer.from(hmac), Buffer.from(parts.v1))) throw new ProviderError('Assinatura Mercado Pago inválida.');
    } else throw new ProviderError('MERCADOPAGO_WEBHOOK_SECRET não configurado.');
    // Confirma o status consultando a API (não confia apenas no corpo do webhook)
    const p = await http(`https://api.mercadopago.com/v1/payments/${dataId}`, { headers: { Authorization: `Bearer ${serverEnv().mercadopago.accessToken}` } });
    const status: WebhookPayment['status'] = p.status === 'approved' ? 'paid' : p.status === 'refunded' ? 'refunded' : p.status === 'cancelled' ? 'cancelled' : 'pending';
    return { externalId: String(p.id), eventId: `${evt.action ?? 'payment'}:${p.id}:${p.status}`, status, amount: Number(p.transaction_amount), paidAt: p.date_approved, externalReference: p.external_reference };
  },
};

// ------------------------------------------------------------------ Stripe
const stripe: PaymentProvider = {
  id: 'stripe',
  isConfigured: () => !!serverEnv().stripe.secretKey,
  async createCharge(input) {
    const body = new URLSearchParams({
      mode: 'payment', success_url: `${process.env.NEXT_PUBLIC_SITE_URL}/portal/financeiro?pagamento=ok`, cancel_url: `${process.env.NEXT_PUBLIC_SITE_URL}/portal/financeiro`,
      'line_items[0][quantity]': '1', 'line_items[0][price_data][currency]': 'brl', 'line_items[0][price_data][unit_amount]': String(Math.round(input.amount * 100)),
      'line_items[0][price_data][product_data][name]': input.description.slice(0, 120), 'metadata[receivable_id]': input.externalReference,
      'payment_intent_data[metadata][receivable_id]': input.externalReference, client_reference_id: input.externalReference,
    });
    if (input.customer.email) body.set('customer_email', input.customer.email);
    const s = await http('https://api.stripe.com/v1/checkout/sessions', { method: 'POST', headers: { Authorization: `Bearer ${serverEnv().stripe.secretKey}`, 'Content-Type': 'application/x-www-form-urlencoded' }, body });
    return { externalId: s.id, paymentUrl: s.url, raw: { id: s.id } };
  },
  async parseWebhook(headers, rawBody) {
    const secret = serverEnv().stripe.webhookSecret;
    if (!secret) throw new ProviderError('STRIPE_WEBHOOK_SECRET não configurado.');
    const sig = headers.get('stripe-signature') ?? '';
    const parts = Object.fromEntries(sig.split(',').map((kv) => kv.split('=') as [string, string]));
    const expected = crypto.createHmac('sha256', secret).update(`${parts.t}.${rawBody}`).digest('hex');
    if (!parts.v1 || !crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(parts.v1))) throw new ProviderError('Assinatura Stripe inválida.');
    if (Math.abs(Date.now() / 1000 - Number(parts.t)) > 300) throw new ProviderError('Webhook Stripe expirado.');
    const evt = JSON.parse(rawBody);
    if (evt.type !== 'checkout.session.completed' && evt.type !== 'checkout.session.async_payment_succeeded') return null;
    const s = evt.data.object;
    if (s.payment_status !== 'paid') return null;
    return { externalId: s.id, eventId: evt.id, status: 'paid', amount: Number(s.amount_total) / 100, paidAt: new Date(evt.created * 1000).toISOString(), externalReference: s.client_reference_id };
  },
};

const PROVIDERS = { asaas, mercadopago, stripe };
export function getPaymentProvider(id: 'asaas' | 'mercadopago' | 'stripe'): PaymentProvider {
  return PROVIDERS[id];
}

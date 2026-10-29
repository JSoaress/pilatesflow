import 'server-only';
import { serverEnv } from '@/lib/env';
import { channelConfigured } from './messaging';
import { getPaymentProvider } from './payments';

/** Quais provedores têm credenciais presentes no servidor (sem revelar valores). */
export function providerCredentials(): Record<string, boolean> {
  const e = serverEnv();
  return {
    whatsapp: channelConfigured('whatsapp'),
    email: channelConfigured('email'),
    sms: channelConfigured('sms'),
    asaas: getPaymentProvider('asaas').isConfigured(),
    mercadopago: getPaymentProvider('mercadopago').isConfigured(),
    stripe: getPaymentProvider('stripe').isConfigured(),
    google_calendar: !!(e.google.clientId && e.google.clientSecret),
    nfse: !!(e.nfse.provider && e.nfse.apiKey),
    wellhub: false,
    totalpass: false,
    sentry: !!e.sentryDsn,
  };
}

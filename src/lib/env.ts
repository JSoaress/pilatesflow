// Variáveis de ambiente validadas. Segredos NUNCA são expostos ao navegador
// (somente variáveis com prefixo NEXT_PUBLIC_ chegam ao cliente).
export const env = {
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
  supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '',
  siteUrl: (process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000').replace(/\/$/, ''),
  defaultOrgSlug: process.env.NEXT_PUBLIC_DEFAULT_ORG_SLUG ?? 'studio-movimento',
  appName: process.env.NEXT_PUBLIC_APP_NAME ?? 'PilatesFlow',
};

export function serverEnv() {
  return {
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? '',
    cronSecret: process.env.CRON_SECRET ?? '',
    allowSignup: (process.env.ALLOW_PUBLIC_SIGNUP ?? 'true') === 'true',
    sentryDsn: process.env.SENTRY_DSN ?? '',
    whatsapp: {
      token: process.env.WHATSAPP_ACCESS_TOKEN ?? '',
      phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID ?? '',
      webhookVerifyToken: process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN ?? '',
      appSecret: process.env.WHATSAPP_APP_SECRET ?? '',
    },
    email: {
      resendApiKey: process.env.RESEND_API_KEY ?? '',
      from: process.env.EMAIL_FROM ?? '',
    },
    sms: {
      twilioSid: process.env.TWILIO_ACCOUNT_SID ?? '',
      twilioToken: process.env.TWILIO_AUTH_TOKEN ?? '',
      twilioFrom: process.env.TWILIO_FROM ?? '',
    },
    asaas: {
      apiKey: process.env.ASAAS_API_KEY ?? '',
      baseUrl: process.env.ASAAS_BASE_URL ?? 'https://sandbox.asaas.com/api/v3',
      webhookToken: process.env.ASAAS_WEBHOOK_TOKEN ?? '',
    },
    mercadopago: {
      accessToken: process.env.MERCADOPAGO_ACCESS_TOKEN ?? '',
      webhookSecret: process.env.MERCADOPAGO_WEBHOOK_SECRET ?? '',
    },
    stripe: {
      secretKey: process.env.STRIPE_SECRET_KEY ?? '',
      webhookSecret: process.env.STRIPE_WEBHOOK_SECRET ?? '',
    },
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID ?? '',
      clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? '',
    },
    nfse: { provider: process.env.NFSE_PROVIDER ?? '', apiKey: process.env.NFSE_API_KEY ?? '' },
  };
}

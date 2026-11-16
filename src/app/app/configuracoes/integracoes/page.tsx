import { requirePermission } from '@/lib/auth/context';
import { PageHeader } from '@/components/ui/misc';
import { IntegrationCard } from '@/components/app/settings/integration-card';
import { providerCredentials } from '@/lib/integrations/status';

export const metadata = { title: 'Integrações' };

const LIST = [
  { provider: 'whatsapp', name: 'WhatsApp (API oficial Meta)', desc: 'Lembretes, confirmações e cobranças pela WhatsApp Cloud API.', env: ['WHATSAPP_ACCESS_TOKEN', 'WHATSAPP_PHONE_NUMBER_ID'] },
  { provider: 'email', name: 'E-mail (Resend)', desc: 'Envio de e-mails transacionais e lembretes.', env: ['RESEND_API_KEY', 'EMAIL_FROM'] },
  { provider: 'sms', name: 'SMS (Twilio)', desc: 'Lembretes por SMS.', env: ['TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'TWILIO_FROM'] },
  { provider: 'asaas', name: 'Asaas', desc: 'Cobrança por Pix, boleto e cartão com baixa automática por webhook.', env: ['ASAAS_API_KEY'] },
  { provider: 'mercadopago', name: 'Mercado Pago', desc: 'Pix e cartão com confirmação automática.', env: ['MERCADOPAGO_ACCESS_TOKEN'] },
  { provider: 'stripe', name: 'Stripe', desc: 'Pagamentos por cartão (checkout hospedado — o sistema nunca armazena dados de cartão).', env: ['STRIPE_SECRET_KEY'] },
  { provider: 'google_calendar', name: 'Google Agenda', desc: 'Sincronização da agenda dos profissionais.', env: ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET'] },
  { provider: 'nfse', name: 'Nota fiscal de serviço (NFS-e)', desc: 'Emissão por provedor de NFS-e (desacoplado).', env: ['NFSE_PROVIDER', 'NFSE_API_KEY'] },
  { provider: 'sentry', name: 'Monitoramento de erros (Sentry)', desc: 'Registro de erros da aplicação.', env: ['SENTRY_DSN'] },
  { provider: 'wellhub', name: 'Wellhub (Gympass)', desc: 'Check-in de usuários Wellhub.', env: [], soon: true },
  { provider: 'totalpass', name: 'TotalPass', desc: 'Check-in de usuários TotalPass.', env: [], soon: true },
];

export default async function IntegrationsPage() {
  const ctx = await requirePermission('settings.view');
  const { data } = await ctx.supabase.from('integrations').select('provider, status, enabled, last_error').eq('organization_id', ctx.org.id);
  const byP = Object.fromEntries(((data ?? []) as any[]).map((i) => [i.provider, i]));
  const creds = providerCredentials();
  return (
    <>
      <PageHeader title="Integrações" description='Uma integração só aparece como "Conectado" quando está ativada e as credenciais existem no servidor. As chaves ficam nas variáveis de ambiente, nunca no navegador.' />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {LIST.map((i) => {
          const row = byP[i.provider];
          const status = !row?.enabled ? 'not_connected' : creds[i.provider] ? 'connected' : 'config_required';
          return <IntegrationCard key={i.provider} provider={i.provider} name={i.name} desc={i.desc} envVars={i.env} status={status} enabled={!!row?.enabled} hasCreds={!!creds[i.provider]} lastError={row?.last_error ?? null} canEdit={ctx.can('settings.edit')} soon={i.soon} />;
        })}
      </div>
    </>
  );
}

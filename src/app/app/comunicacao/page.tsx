import Link from 'next/link';
import { requirePermission } from '@/lib/auth/context';
import { PageHeader, Table, Th, Td, Tr, EmptyState, Section } from '@/components/ui/misc';
import { Badge, statusVariant } from '@/components/ui/badge';
import { TabLinks } from '@/components/ui/tab-links';
import { ResourceSection } from '@/components/resource/resource-page';
import { FilterSelect, Pagination } from '@/components/app/list-controls';
import { SettingsForm } from '@/components/app/settings-form';
import { CancelMessageButton } from '@/components/app/comm/cancel-message';
import { providerCredentials } from '@/lib/integrations/status';
import { dateTime } from '@/lib/format';
import { label, messageStatus, channel } from '@/lib/labels';

export const metadata = { title: 'Comunicação' };

export default async function CommunicationPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const ctx = await requirePermission('communication.view');
  const sp = await searchParams;
  const tab = ['modelos', 'automacoes'].includes(sp.aba) ? sp.aba : 'historico';
  const page = Math.max(1, Number(sp.p ?? 1) || 1);
  let rows: any[] = [], count = 0, automations: any = {};
  if (tab === 'historico') {
    let q = ctx.supabase.from('messages').select('id, channel, template_key, to_address, body, status, error, created_at, sent_at, patients(id, full_name), leads(id, name)', { count: 'exact' }).eq('organization_id', ctx.org.id);
    if (sp.status) q = q.eq('status', sp.status);
    if (sp.canal) q = q.eq('channel', sp.canal);
    const r = await q.order('created_at', { ascending: false }).range((page - 1) * 40, page * 40 - 1);
    rows = r.data ?? []; count = r.count ?? 0;
  }
  if (tab === 'automacoes') {
    const { data } = await ctx.supabase.from('system_settings').select('value').eq('organization_id', ctx.org.id).eq('key', 'automations').maybeSingle();
    automations = data?.value ?? {};
  }
  const creds = providerCredentials();
  return (
    <>
      <PageHeader title="Comunicação" description="Central de mensagens: WhatsApp (API oficial), e-mail e SMS, com histórico de envio." />
      <div className="mb-4 flex flex-wrap gap-2 text-xs">
        {(['whatsapp', 'email', 'sms'] as const).map((c) => <Badge key={c} variant={creds[c] ? 'success' : 'neutral'}>{label(channel, c)}: {creds[c] ? 'configurado' : 'não configurado'}</Badge>)}
        {ctx.can('settings.view') && <Link href="/app/configuracoes/integracoes" className="text-primary hover:underline">Gerenciar integrações</Link>}
      </div>
      <TabLinks base="/app/comunicacao" active={tab} tabs={[{ id: 'historico', label: 'Histórico de envios' }, { id: 'modelos', label: 'Modelos' }, { id: 'automacoes', label: 'Automações', hidden: !ctx.can('settings.edit') }]} />
      {tab === 'historico' && (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <FilterSelect param="status" label="Status" allLabel="Todos os status" options={Object.entries(messageStatus).map(([value, l]) => ({ value, label: l }))} />
            <FilterSelect param="canal" label="Canal" allLabel="Todos os canais" options={Object.entries(channel).map(([value, l]) => ({ value, label: l }))} />
          </div>
          {rows.length === 0 ? <EmptyState title="Nenhuma mensagem" /> : (
            <Table>
              <thead><tr><Th>Data</Th><Th>Destinatário</Th><Th>Canal</Th><Th>Modelo</Th><Th>Mensagem</Th><Th>Status</Th><Th /></tr></thead>
              <tbody>
                {rows.map((m) => (
                  <Tr key={m.id}>
                    <Td className="whitespace-nowrap">{dateTime(m.created_at, ctx.tz)}</Td>
                    <Td>{m.patients ? <Link href={`/app/alunos/${m.patients.id}?aba=mensagens`} className="hover:underline">{m.patients.full_name}</Link> : m.leads?.name ?? '—'}<span className="block text-xs text-muted-foreground">{m.to_address}</span></Td>
                    <Td>{label(channel, m.channel)}</Td>
                    <Td className="text-xs">{m.template_key ?? '—'}</Td>
                    <Td><p className="line-clamp-2 max-w-sm text-sm">{m.body}</p></Td>
                    <Td><Badge variant={statusVariant[m.status] ?? 'neutral'}>{label(messageStatus, m.status)}</Badge>{m.error && <span className="block max-w-[200px] text-xs text-destructive">{m.error}</span>}</Td>
                    <Td>{m.status === 'queued' && ctx.can('communication.create') && <CancelMessageButton id={m.id} />}</Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          )}
          <Pagination page={page} total={count} pageSize={40} />
        </div>
      )}
      {tab === 'modelos' && <ResourceSection resource="message_templates" searchParams={sp} />}
      {tab === 'automacoes' && (
        <Section title="Automações" description="Mensagens automáticas enviadas pela rotina diária. Só são enviadas se o canal estiver configurado; caso contrário ficam registradas como falha no histórico.">
          <SettingsForm settingKey="automations" initial={automations} fields={[
            { name: 'channel', label: 'Canal padrão', type: 'select', options: [{ value: 'whatsapp', label: 'WhatsApp' }, { value: 'email', label: 'E-mail' }, { value: 'sms', label: 'SMS' }] },
            { name: 'appointment_reminder_enabled', label: 'Lembrete de aula', type: 'bool' },
            { name: 'appointment_reminder_hours', label: 'Antecedência do lembrete (horas)', type: 'int' },
            { name: 'payment_due_reminder_enabled', label: 'Aviso de mensalidade a vencer', type: 'bool' },
            { name: 'payment_due_reminder_days', label: 'Dias antes do vencimento', type: 'int' },
            { name: 'overdue_reminder_enabled', label: 'Cobrança automática de vencidos', type: 'bool' },
            { name: 'overdue_reminder_every_days', label: 'Repetir cobrança a cada (dias)', type: 'int' },
            { name: 'birthday_message_enabled', label: 'Mensagem de aniversário', type: 'bool' },
          ]} />
        </Section>
      )}
    </>
  );
}

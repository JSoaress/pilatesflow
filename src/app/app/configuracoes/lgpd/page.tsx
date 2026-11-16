import { requirePermission } from '@/lib/auth/context';
import { PageHeader, Section, Table, Th, Td, Tr, EmptyState } from '@/components/ui/misc';
import { TabLinks } from '@/components/ui/tab-links';
import { ResourceSection } from '@/components/resource/resource-page';
import { LegalDocsManager, SubjectTools } from '@/components/app/settings/lgpd-tools';
import { getResourceDef } from '@/lib/resources/defs';
import { listResource, loadRefOptions } from '@/lib/resources/server';
import { dateTime } from '@/lib/format';

export const metadata = { title: 'LGPD e privacidade' };

const PURPOSE: Record<string, string> = { privacy_policy: 'Política de privacidade', terms_of_use: 'Termos de uso', health_data: 'Dados de saúde', image_use: 'Uso de imagem', marketing: 'Marketing', whatsapp_contact: 'Contato por WhatsApp' };
const CHANNEL: Record<string, string> = { website: 'Site', portal: 'Portal', system: 'Sistema', paper: 'Papel' };

export default async function LgpdPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const ctx = await requirePermission('lgpd.view');
  const sp = await searchParams;
  const tabs = [{ id: 'documentos', label: 'Políticas e termos' }, { id: 'solicitacoes', label: 'Solicitações de titulares' }, { id: 'consentimentos', label: 'Consentimentos' }, { id: 'titular', label: 'Exportar / anonimizar' }];
  const tab = tabs.some((t) => t.id === sp.aba) ? sp.aba : 'documentos';
  let body: React.ReactNode = null;
  if (tab === 'documentos') {
    const def = getResourceDef('legal_documents');
    const [list, refOptions] = await Promise.all([listResource(ctx, 'legal_documents', { q: sp.q, page: Number(sp.p ?? 1) || 1 }), loadRefOptions(ctx, def)]);
    body = <LegalDocsManager def={def} rows={list.rows} total={list.total} page={list.page} pageSize={list.pageSize} refOptions={refOptions} tz={ctx.tz} can={{ create: ctx.can('lgpd.manage'), edit: ctx.can('lgpd.manage'), delete: false }} />;
  }
  if (tab === 'solicitacoes') body = <ResourceSection resource="data_subject_requests" searchParams={sp} />;
  if (tab === 'consentimentos') {
    const { data } = await ctx.supabase.from('consents').select('id, purpose, granted, granted_at, revoked_at, channel, patient:patients(full_name), lead:leads(name), doc:legal_documents(version)').eq('organization_id', ctx.org.id).order('granted_at', { ascending: false }).limit(200);
    const rows = (data ?? []) as any[];
    body = rows.length === 0 ? <EmptyState title="Nenhum consentimento registrado" /> : (
      <div className="overflow-x-auto rounded-xl border bg-card"><Table>
        <thead><tr><Th>Titular</Th><Th>Finalidade</Th><Th>Versão</Th><Th>Canal</Th><Th>Data</Th><Th>Situação</Th></tr></thead>
        <tbody>{rows.map((c) => <Tr key={c.id}><Td>{c.patient?.full_name ?? c.lead?.name ?? '—'}</Td><Td>{PURPOSE[c.purpose] ?? c.purpose}</Td><Td>{c.doc?.version ? `v${c.doc.version}` : '—'}</Td><Td>{CHANNEL[c.channel] ?? c.channel}</Td><Td>{dateTime(c.granted_at, ctx.tz)}</Td><Td>{c.revoked_at ? `Revogado em ${dateTime(c.revoked_at, ctx.tz)}` : c.granted ? 'Concedido' : 'Negado'}</Td></Tr>)}</tbody>
      </Table></div>
    );
  }
  if (tab === 'titular') body = ctx.can('lgpd.manage') ? <Section title="Direitos do titular" description="A exportação e a anonimização ficam registradas na auditoria."><SubjectTools /></Section> : <EmptyState title="Sem permissão" description="Requer a permissão LGPD › Gerenciar." />;
  return (
    <>
      <PageHeader title="LGPD e privacidade" description="Políticas versionadas, consentimentos registrados e atendimento aos titulares de dados." />
      <TabLinks base="/app/configuracoes/lgpd" active={tab} tabs={tabs} />
      {body}
    </>
  );
}

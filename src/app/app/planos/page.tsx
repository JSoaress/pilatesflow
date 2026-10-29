import Link from 'next/link';
import { requirePermission } from '@/lib/auth/context';
import { PageHeader, Table, Th, Td, Tr, EmptyState } from '@/components/ui/misc';
import { Badge, statusVariant } from '@/components/ui/badge';
import { TabLinks } from '@/components/ui/tab-links';
import { ResourceSection } from '@/components/resource/resource-page';
import { FilterSelect, Pagination } from '@/components/app/list-controls';
import { ContractRowActions } from '@/components/app/finance/row-actions';
import { date, money } from '@/lib/format';
import { label, subscriptionStatus, contractStatus } from '@/lib/labels';

export const metadata = { title: 'Planos' };

export default async function PlansPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const ctx = await requirePermission('plans.view');
  const sp = await searchParams;
  const tab = ['assinaturas', 'contratos', 'modelos'].includes(sp.aba) ? sp.aba : 'planos';
  const page = Math.max(1, Number(sp.p ?? 1) || 1);
  let subs: any[] = [], subsCount = 0, contracts: any[] = [], contractsCount = 0;
  if (tab === 'assinaturas') {
    let q = ctx.supabase.from('subscriptions').select('id, status, start_date, end_date, price, discount_percent, sessions_total, sessions_used, sessions_extra, auto_renew, patients(id, full_name), plans(name)', { count: 'exact' }).eq('organization_id', ctx.org.id);
    q = q.eq('status', sp.status || 'active');
    if (ctx.unitId) q = q.eq('unit_id', ctx.unitId);
    const r = await q.order('end_date', { ascending: true, nullsFirst: false }).range((page - 1) * 30, page * 30 - 1);
    subs = r.data ?? []; subsCount = r.count ?? 0;
  }
  if (tab === 'contratos' && ctx.can('contracts.view')) {
    let q = ctx.supabase.from('contracts').select('id, number, title, status, start_date, end_date, accepted_at, patients(id, full_name)', { count: 'exact' }).eq('organization_id', ctx.org.id);
    if (sp.status) q = q.eq('status', sp.status);
    const r = await q.order('created_at', { ascending: false }).range((page - 1) * 30, page * 30 - 1);
    contracts = r.data ?? []; contractsCount = r.count ?? 0;
  }
  return (
    <>
      <PageHeader title="Planos e contratos" description="Planos, pacotes, assinaturas dos alunos e contratos." />
      <TabLinks base="/app/planos" active={tab} tabs={[
        { id: 'planos', label: 'Planos e pacotes' }, { id: 'assinaturas', label: 'Assinaturas' },
        { id: 'contratos', label: 'Contratos', hidden: !ctx.can('contracts.view') }, { id: 'modelos', label: 'Modelos de contrato', hidden: !ctx.can('contracts.view') },
      ]} />
      {tab === 'planos' && <ResourceSection resource="plans" searchParams={sp} />}
      {tab === 'modelos' && <ResourceSection resource="contract_templates" searchParams={sp} />}
      {tab === 'assinaturas' && (
        <div className="space-y-3">
          <FilterSelect param="status" label="Status" allLabel="Ativas" options={Object.entries(subscriptionStatus).filter(([k]) => k !== 'active').map(([value, l]) => ({ value, label: l }))} />
          {subs.length === 0 ? <EmptyState title="Nenhuma assinatura" description="Contrate planos pela ficha do aluno (aba Plano e financeiro)." /> : (
            <Table>
              <thead><tr><Th>Aluno</Th><Th>Plano</Th><Th>Vigência</Th><Th>Valor</Th><Th>Aulas</Th><Th>Status</Th></tr></thead>
              <tbody>
                {subs.map((s) => (
                  <Tr key={s.id}>
                    <Td><Link href={`/app/alunos/${s.patients?.id}?aba=financeiro`} className="font-medium hover:underline">{s.patients?.full_name}</Link></Td>
                    <Td>{s.plans?.name}{s.auto_renew && <span className="block text-xs text-muted-foreground">renovação automática</span>}</Td>
                    <Td className="whitespace-nowrap">{date(s.start_date)} – {s.end_date ? date(s.end_date) : '—'}</Td>
                    <Td className="tabular-nums">{money(s.price * (1 - s.discount_percent / 100))}</Td>
                    <Td className="tabular-nums">{s.sessions_total ? `${s.sessions_used}/${s.sessions_total + s.sessions_extra}` : s.sessions_used}</Td>
                    <Td><Badge variant={statusVariant[s.status] ?? 'neutral'}>{label(subscriptionStatus, s.status)}</Badge></Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          )}
          <Pagination page={page} total={subsCount} pageSize={30} />
        </div>
      )}
      {tab === 'contratos' && (
        <div className="space-y-3">
          <FilterSelect param="status" label="Status" options={Object.entries(contractStatus).map(([value, l]) => ({ value, label: l }))} />
          {contracts.length === 0 ? <EmptyState title="Nenhum contrato" /> : (
            <Table>
              <thead><tr><Th>Nº</Th><Th>Aluno</Th><Th>Contrato</Th><Th>Vigência</Th><Th>Status</Th><Th /></tr></thead>
              <tbody>
                {contracts.map((c) => (
                  <Tr key={c.id}>
                    <Td className="tabular-nums">{c.number}</Td>
                    <Td><Link href={`/app/alunos/${c.patients?.id}?aba=financeiro`} className="hover:underline">{c.patients?.full_name}</Link></Td>
                    <Td>{c.title}</Td>
                    <Td className="whitespace-nowrap">{c.start_date ? date(c.start_date) : '—'} – {c.end_date ? date(c.end_date) : '—'}</Td>
                    <Td><Badge variant={statusVariant[c.status] ?? 'neutral'}>{label(contractStatus, c.status)}</Badge></Td>
                    <Td className="text-right"><ContractRowActions id={c.id} status={c.status} canEdit={ctx.can('contracts.edit')} /></Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          )}
          <Pagination page={page} total={contractsCount} pageSize={30} />
        </div>
      )}
    </>
  );
}

import { requirePermission } from '@/lib/auth/context';
import { PageHeader, ErrorState } from '@/components/ui/misc';
import { FilterSelect } from '@/components/app/list-controls';
import { PayablesClient } from '@/components/app/finance/payables-client';
import { getResourceDef } from '@/lib/resources/defs';
import { listResource, loadRefOptions } from '@/lib/resources/server';
import { payableStatus } from '@/lib/labels';
import { money } from '@/lib/format';

export const metadata = { title: 'Contas a pagar' };

export default async function PayablesPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const ctx = await requirePermission('finance.view');
  const sp = await searchParams;
  const def = getResourceDef('accounts_payable');
  try {
    const status = sp.status || null;
    const [list, refOptions, accounts, open] = await Promise.all([
      listResource(ctx, 'accounts_payable', { q: sp.q, page: Number(sp.p ?? 1) || 1, filters: status ? { status } : {} }),
      loadRefOptions(ctx, def),
      ctx.supabase.from('cash_accounts').select('id, name').eq('organization_id', ctx.org.id).eq('is_active', true),
      ctx.supabase.from('accounts_payable').select('amount, status').eq('organization_id', ctx.org.id).is('deleted_at', null).in('status', ['pending', 'overdue']),
    ]);
    const totalOpen = ((open.data ?? []) as any[]).reduce((t, r) => t + Number(r.amount), 0);
    const overdue = ((open.data ?? []) as any[]).filter((r) => r.status === 'overdue').reduce((t, r) => t + Number(r.amount), 0);
    return (
      <>
        <PageHeader title="Contas a pagar" description={`Em aberto: ${money(totalOpen)}${overdue ? ` · vencido: ${money(overdue)}` : ''}`} />
        <div className="mb-4"><FilterSelect param="status" label="Status" allLabel="Todos" options={Object.entries(payableStatus).map(([value, l]) => ({ value, label: l }))} /></div>
        <PayablesClient def={def} rows={list.rows} total={list.total} page={list.page} pageSize={list.pageSize} refOptions={refOptions} tz={ctx.tz}
          can={{ create: ctx.can('finance.create'), edit: ctx.can('finance.edit'), delete: ctx.can('finance.delete') }}
          accounts={(accounts.data ?? []) as any[]} canPay={ctx.can('finance.edit')} />
      </>
    );
  } catch {
    return <ErrorState />;
  }
}

import Link from 'next/link';
import { Download } from 'lucide-react';
import { requirePermission } from '@/lib/auth/context';
import { PageHeader, Table, Th, Td, Tr, EmptyState } from '@/components/ui/misc';
import { Badge, statusVariant } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { SearchBox, FilterSelect, Pagination } from '@/components/app/list-controls';
import { PaymentButton, ChargeButton } from '@/components/app/finance/payment-dialog';
import { ReceivableRowActions, PaymentRowActions } from '@/components/app/finance/row-actions';
import { NewReceivableButton } from '@/components/app/finance/new-receivable';
import { date, dateTime, money } from '@/lib/format';
import { label, receivableStatus, paymentMethod } from '@/lib/labels';

export const metadata = { title: 'Contas a receber' };
const PAGE = 30;

export default async function ReceivablesPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const ctx = await requirePermission('finance.view');
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.p ?? 1) || 1);
  const term = (sp.q ?? '').replace(/[%_,()]/g, ' ').trim();
  let q = ctx.supabase.from('v_receivables').select('*', { count: 'exact' }).eq('organization_id', ctx.org.id);
  if (ctx.unitId) q = q.eq('unit_id', ctx.unitId);
  q = sp.status ? q.eq('status', sp.status) : q.in('status', ['pending', 'overdue', 'partial']);
  if (sp.de) q = q.gte('due_date', sp.de);
  if (sp.ate) q = q.lte('due_date', sp.ate);
  if (term) q = q.or(`description.ilike.%${term}%,patient_name.ilike.%${term}%`);
  const [{ data, count }, accounts, cats, payment] = await Promise.all([
    q.order('due_date', { ascending: sp.status === 'paid' ? false : true }).range((page - 1) * PAGE, page * PAGE - 1),
    ctx.supabase.from('cash_accounts').select('id, name').eq('organization_id', ctx.org.id).eq('is_active', true),
    ctx.supabase.from('financial_categories').select('id, name').eq('organization_id', ctx.org.id).eq('type', 'income').eq('is_active', true).order('name'),
    sp.pagamento ? ctx.supabase.from('payments').select('*, patients(full_name)').eq('id', sp.pagamento).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  const rows = (data ?? []) as any[];
  const total = rows.reduce((t, r) => t + Number(r.open_amount), 0);
  const pay = payment.data as any;
  return (
    <>
      <PageHeader title="Contas a receber" description="Mensalidades, avaliações, sessões avulsas, produtos e taxas."
        actions={<>
          {ctx.can('finance.export') && <a href={`/api/export/receivables?format=xlsx&status=${sp.status ?? ''}`}><Button variant="outline"><Download /> Exportar</Button></a>}
          {ctx.can('finance.create') && <NewReceivableButton categories={(cats.data ?? []) as any[]} patients={[]} />}
        </>} />
      {pay && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border bg-card p-4 text-sm shadow-soft">
          <span>Pagamento nº {pay.receipt_number} · {pay.patients?.full_name} · {money(pay.amount)} · {label(paymentMethod, pay.method)} · {dateTime(pay.paid_at, ctx.tz)} {pay.status === 'refunded' && <Badge variant="neutral">Estornado</Badge>}</span>
          <PaymentRowActions paymentId={pay.id} status={pay.status} canRefund={ctx.can('finance.refund')} />
        </div>
      )}
      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center">
        <SearchBox placeholder="Aluno ou descrição" />
        <FilterSelect param="status" label="Status" allLabel="Em aberto (pendente, vencido, parcial)" options={Object.entries(receivableStatus).map(([value, l]) => ({ value, label: l }))} />
        <span className="text-sm text-muted-foreground sm:ml-auto">Em aberto nesta página: <b>{money(total)}</b></span>
      </div>
      {rows.length === 0 ? <EmptyState title="Nenhum título encontrado" /> : (
        <>
          <Table>
            <thead><tr><Th>Vencimento</Th><Th>Aluno</Th><Th>Descrição</Th><Th className="text-right">Valor</Th><Th className="text-right">Em aberto</Th><Th>Status</Th><Th /></tr></thead>
            <tbody>
              {rows.map((r) => (
                <Tr key={r.id}>
                  <Td className="whitespace-nowrap">{date(r.due_date)}{r.status === 'overdue' && <span className="block text-xs text-destructive">{r.days_overdue} dias</span>}</Td>
                  <Td>{r.patient_id ? <Link href={`/app/alunos/${r.patient_id}?aba=financeiro`} className="hover:underline">{r.patient_name}</Link> : '—'}</Td>
                  <Td>{r.description}<span className="block text-xs text-muted-foreground">{r.category_name ?? ''}</span></Td>
                  <Td className="text-right tabular-nums">{money(Number(r.amount) - Number(r.discount) + Number(r.surcharge))}</Td>
                  <Td className="text-right tabular-nums">{money(r.open_amount)}</Td>
                  <Td><Badge variant={statusVariant[r.status] ?? 'neutral'}>{label(receivableStatus, r.status)}</Badge></Td>
                  <Td className="whitespace-nowrap text-right">
                    <div className="flex justify-end gap-1">
                      {['pending', 'overdue', 'partial'].includes(r.status) && ctx.can('finance.create') && (
                        <><ChargeButton receivableId={r.id} /><PaymentButton receivable={{ id: r.id, description: r.description, open_amount: Number(r.open_amount), due_date: r.due_date, patient_name: r.patient_name, payment_method: r.payment_method }} accounts={(accounts.data ?? []) as any[]} /></>
                      )}
                      {['pending', 'overdue'].includes(r.status) && Number(r.amount_paid) === 0 && <ReceivableRowActions id={r.id} canEdit={ctx.can('finance.edit')} />}
                    </div>
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
          <div className="mt-3"><Pagination page={page} total={count ?? 0} pageSize={PAGE} /></div>
        </>
      )}
    </>
  );
}

import Link from 'next/link';
import { AlertTriangle } from 'lucide-react';
import { requirePermission } from '@/lib/auth/context';
import { PageHeader, Table, Th, Td, Tr, EmptyState, StatCard } from '@/components/ui/misc';
import { FilterSelect } from '@/components/app/list-controls';
import { OverdueActions } from '@/components/app/finance/overdue-actions';
import { PaymentButton } from '@/components/app/finance/payment-dialog';
import { date, money, relative } from '@/lib/format';
import { whatsappLink } from '@/lib/utils';

export const metadata = { title: 'Inadimplência' };

const BUCKETS: Record<string, [number, number]> = { '1-7': [1, 7], '8-15': [8, 15], '16-30': [16, 30], '30+': [31, 100000] };

export default async function OverduePage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const ctx = await requirePermission('finance.view');
  const sp = await searchParams;
  let q = ctx.supabase.from('v_receivables').select('*').eq('organization_id', ctx.org.id).in('status', ['overdue', 'partial', 'pending']).gt('days_overdue', 0);
  if (ctx.unitId) q = q.eq('unit_id', ctx.unitId);
  const [{ data }, accounts] = await Promise.all([q.order('due_date').limit(1000), ctx.supabase.from('cash_accounts').select('id, name').eq('organization_id', ctx.org.id).eq('is_active', true)]);
  const all = (data ?? []) as any[];
  const b = BUCKETS[sp.faixa ?? ''];
  const rows = b ? all.filter((r) => r.days_overdue >= b[0] && r.days_overdue <= b[1]) : all;
  const sum = (list: any[]) => list.reduce((t, r) => t + Number(r.open_amount), 0);
  const org = ctx.org.name;
  return (
    <>
      <PageHeader title="Inadimplência" description="Títulos vencidos em aberto. Cobranças automáticas podem ser ativadas em Configurações → Regras e automações." />
      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <StatCard label="Total vencido" value={money(sum(all))} icon={AlertTriangle} tone="danger" hint={`${all.length} título(s)`} />
        {Object.entries(BUCKETS).map(([k, [a, z]]) => {
          const list = all.filter((r) => r.days_overdue >= a && r.days_overdue <= z);
          return <StatCard key={k} label={`${k} dias`} value={money(sum(list))} hint={`${list.length} título(s)`} href={`?faixa=${k}`} />;
        })}
      </div>
      <div className="mb-4"><FilterSelect param="faixa" label="Dias de atraso" allLabel="Todas as faixas" options={Object.keys(BUCKETS).map((k) => ({ value: k, label: `${k} dias` }))} /></div>
      {rows.length === 0 ? <EmptyState title="Nenhum título vencido" description="Ótimo! Não há inadimplência nesta faixa." /> : (
        <Table>
          <thead><tr><Th>Aluno</Th><Th>Descrição</Th><Th>Vencimento</Th><Th className="text-right">Valor</Th><Th className="text-right">Atraso</Th><Th>Telefone</Th><Th>Último contato</Th><Th /></tr></thead>
          <tbody>
            {rows.map((r) => {
              const wa = whatsappLink(r.patient_whatsapp ?? r.patient_phone, `Olá, ${String(r.patient_name ?? '').split(' ')[0]}! Aqui é da ${org}. Identificamos o valor de ${money(r.open_amount)} com vencimento em ${date(r.due_date)}. Podemos ajudar com o pagamento?`);
              return (
                <Tr key={r.id}>
                  <Td>{r.patient_id ? <Link href={`/app/alunos/${r.patient_id}?aba=financeiro`} className="font-medium hover:underline">{r.patient_name}</Link> : '—'}</Td>
                  <Td>{r.description}</Td>
                  <Td>{date(r.due_date)}</Td>
                  <Td className="text-right tabular-nums">{money(r.open_amount)}</Td>
                  <Td className="text-right tabular-nums text-destructive">{r.days_overdue} dias</Td>
                  <Td className="whitespace-nowrap">{r.patient_whatsapp ?? r.patient_phone ?? '—'}</Td>
                  <Td className="whitespace-nowrap text-muted-foreground">{r.last_contact_at ? relative(r.last_contact_at) : 'Nunca'}</Td>
                  <Td>
                    <div className="flex justify-end gap-1">
                      <OverdueActions receivableId={r.id} whatsappHref={wa} canSend={ctx.can('communication.create')} />
                      {ctx.can('finance.create') && <PaymentButton receivable={{ id: r.id, description: r.description, open_amount: Number(r.open_amount), due_date: r.due_date, patient_name: r.patient_name, payment_method: r.payment_method }} accounts={(accounts.data ?? []) as any[]} />}
                    </div>
                  </Td>
                </Tr>
              );
            })}
          </tbody>
        </Table>
      )}
    </>
  );
}

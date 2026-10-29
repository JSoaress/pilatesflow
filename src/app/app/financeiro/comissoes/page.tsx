import { requirePermission } from '@/lib/auth/context';
import { PageHeader, Table, Th, Td, Tr, EmptyState, Section } from '@/components/ui/misc';
import { Badge } from '@/components/ui/badge';
import { ResourceSection } from '@/components/resource/resource-page';
import { CommissionControls, CommissionRowActions } from '@/components/app/finance/cash-controls';
import { money, number, todayISO } from '@/lib/format';
import { commissionBasis, label } from '@/lib/labels';

export const metadata = { title: 'Comissões' };
const ST: Record<string, string> = { calculated: 'Calculada', approved: 'Aprovada', paid: 'Paga', cancelled: 'Cancelada' };

export default async function CommissionsPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const ctx = await requirePermission('commissions.view');
  const sp = await searchParams;
  const month = /^\d{4}-\d{2}$/.test(sp.mes ?? '') ? sp.mes : todayISO(ctx.tz).slice(0, 7);
  const { data } = await ctx.supabase.from('commissions').select('id, basis, quantity, base_amount, amount, status, details, staff(full_name)').eq('organization_id', ctx.org.id).eq('period_month', `${month}-01`).order('amount', { ascending: false });
  const rows = (data ?? []) as any[];
  const byStaff = new Map<string, { n: number; total: number }>();
  for (const r of rows) { const k = r.staff?.full_name ?? '—'; const v = byStaff.get(k) ?? { n: 0, total: 0 }; v.n += Number(r.quantity); v.total += Number(r.amount); byStaff.set(k, v); }
  return (
    <>
      <PageHeader title="Comissões" description="Relatório gerencial de atendimentos e valores devidos. Não substitui folha de pagamento nem contabilidade trabalhista."
        actions={<CommissionControls month={month} canCalc={ctx.can('commissions.create')} />} />
      {rows.length === 0 ? <EmptyState title="Nenhuma comissão calculada para o mês" description="Cadastre as regras abaixo e clique em “Calcular comissões do mês”." /> : (
        <div className="space-y-6">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[...byStaff.entries()].map(([name, v]) => (
              <div key={name} className="rounded-xl border bg-card p-4 shadow-soft"><p className="text-sm text-muted-foreground">{name}</p><p className="text-xl font-semibold tabular-nums">{money(v.total)}</p></div>
            ))}
          </div>
          <Table>
            <thead><tr><Th>Profissional</Th><Th>Regra</Th><Th>Base</Th><Th className="text-right">Qtd.</Th><Th className="text-right">Base (R$)</Th><Th className="text-right">Valor devido</Th><Th>Status</Th><Th /></tr></thead>
            <tbody>
              {rows.map((r) => (
                <Tr key={r.id}>
                  <Td>{r.staff?.full_name}</Td>
                  <Td>{r.details?.rule}</Td>
                  <Td>{label(commissionBasis, r.basis)}</Td>
                  <Td className="text-right tabular-nums">{number(r.quantity)}</Td>
                  <Td className="text-right tabular-nums">{Number(r.base_amount) ? money(r.base_amount) : '—'}</Td>
                  <Td className="text-right font-medium tabular-nums">{money(r.amount)}</Td>
                  <Td><Badge variant={r.status === 'paid' ? 'success' : r.status === 'approved' ? 'info' : 'neutral'}>{ST[r.status]}</Badge></Td>
                  <Td>{ctx.can('commissions.edit') && <CommissionRowActions id={r.id} status={r.status} />}</Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        </div>
      )}
      <Section title="Regras de comissão" className="mt-8"><ResourceSection resource="commission_rules" searchParams={sp} compact hideSearch /></Section>
    </>
  );
}

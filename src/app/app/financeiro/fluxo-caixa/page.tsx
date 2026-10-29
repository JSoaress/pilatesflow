import { Download } from 'lucide-react';
import { requirePermission } from '@/lib/auth/context';
import { PageHeader, Table, Th, Td, Tr, ErrorState, Section } from '@/components/ui/misc';
import { Button } from '@/components/ui/button';
import { PeriodFilter, resolvePeriod } from '@/components/app/period-filter';
import { GroupSelect, CashMovementButton } from '@/components/app/finance/cash-controls';
import { LineCard } from '@/components/charts/charts';
import { date, money, todayISO, fmt } from '@/lib/format';

export const metadata = { title: 'Fluxo de caixa' };

export default async function CashFlowPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const ctx = await requirePermission('finance.view');
  const sp = await searchParams;
  const period = resolvePeriod(sp, todayISO(ctx.tz));
  const group = ['day', 'month', 'year'].includes(sp.agrupar) ? sp.agrupar : 'day';
  const [flow, cats, accounts, recent] = await Promise.all([
    ctx.supabase.rpc('cash_flow', { p_org: ctx.org.id, p_unit: ctx.unitId, p_from: period.from, p_to: period.to, p_group: group }),
    ctx.supabase.from('financial_categories').select('id, name, type').eq('organization_id', ctx.org.id).eq('is_active', true).order('name'),
    ctx.supabase.from('cash_accounts').select('id, name').eq('organization_id', ctx.org.id).eq('is_active', true),
    ctx.supabase.from('cash_movements').select('id, type, amount, occurred_on, description, source').eq('organization_id', ctx.org.id).gte('occurred_on', period.from).lte('occurred_on', period.to).order('occurred_on', { ascending: false }).limit(100),
  ]);
  if (flow.error) return <ErrorState />;
  const rows = (flow.data ?? []) as any[];
  const label = (d: string) => (group === 'day' ? date(d) : group === 'month' ? fmt(d, 'MMM/yyyy') : d.slice(0, 4));
  const totals = rows.reduce((t, r) => ({ i: t.i + Number(r.inflow), o: t.o + Number(r.outflow), fi: t.fi + Number(r.forecast_in), fo: t.fo + Number(r.forecast_out) }), { i: 0, o: 0, fi: 0, fo: 0 });
  return (
    <>
      <PageHeader title="Fluxo de caixa" description="Saldo inicial, entradas, saídas e saldo final — realizado e previsto."
        actions={<>
          <PeriodFilter {...period} /><GroupSelect value={group} />
          {ctx.can('finance.export') && <a href={`/api/export/cash-flow?format=xlsx&from=${period.from}&to=${period.to}&group=${group}`}><Button variant="outline"><Download /> XLSX</Button></a>}
          {ctx.can('finance.create') && <CashMovementButton categories={(cats.data ?? []) as any[]} accounts={(accounts.data ?? []) as any[]} />}
        </>} />
      <LineCard title="Saldo final" data={rows.map((r) => ({ periodo: label(r.period), saldo: Number(r.closing) }))} x="periodo" series={[{ key: 'saldo', label: 'Saldo' }]} format="money" height={220} />
      <div className="mt-6">
        <Table>
          <thead><tr><Th>Período</Th><Th className="text-right">Saldo inicial</Th><Th className="text-right">Entradas</Th><Th className="text-right">Saídas</Th><Th className="text-right">Saldo final</Th><Th className="text-right">A receber (previsto)</Th><Th className="text-right">A pagar (previsto)</Th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <Tr key={r.period}>
                <Td className="capitalize">{label(r.period)}</Td>
                <Td className="text-right tabular-nums">{money(r.opening)}</Td>
                <Td className="text-right tabular-nums text-success">{money(r.inflow)}</Td>
                <Td className="text-right tabular-nums text-destructive">{money(r.outflow)}</Td>
                <Td className="text-right font-medium tabular-nums">{money(r.closing)}</Td>
                <Td className="text-right tabular-nums text-muted-foreground">{money(r.forecast_in)}</Td>
                <Td className="text-right tabular-nums text-muted-foreground">{money(r.forecast_out)}</Td>
              </Tr>
            ))}
            <Tr className="bg-muted/40 font-medium">
              <Td>Total</Td><Td /><Td className="text-right tabular-nums">{money(totals.i)}</Td><Td className="text-right tabular-nums">{money(totals.o)}</Td>
              <Td className="text-right tabular-nums">{money(rows.at(-1)?.closing ?? 0)}</Td><Td className="text-right tabular-nums">{money(totals.fi)}</Td><Td className="text-right tabular-nums">{money(totals.fo)}</Td>
            </Tr>
          </tbody>
        </Table>
        <p className="mt-2 text-xs text-muted-foreground">Previsto × realizado: realizado = movimentos de caixa; previsto = títulos em aberto com vencimento no período.</p>
      </div>
      <Section title="Movimentações do período" className="mt-6">
        {(recent.data ?? []).length === 0 ? <p className="text-sm text-muted-foreground">Nenhuma movimentação.</p> : (
          <ul className="divide-y text-sm">
            {((recent.data ?? []) as any[]).map((m) => (
              <li key={m.id} className="flex items-center justify-between gap-3 py-2">
                <span><span className="text-muted-foreground">{date(m.occurred_on)}</span> · {m.description}</span>
                <span className={m.type === 'in' ? 'tabular-nums text-success' : 'tabular-nums text-destructive'}>{m.type === 'in' ? '+' : '−'}{money(m.amount)}</span>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </>
  );
}

import { TrendingUp, TrendingDown, Scale, HandCoins, Receipt, AlertTriangle, Target, Wallet } from 'lucide-react';
import { requirePermission } from '@/lib/auth/context';
import { PageHeader, StatCard, ErrorState } from '@/components/ui/misc';
import { PeriodFilter } from '@/components/app/period-filter';
import { resolvePeriod } from '@/components/app/period';
import { ComboCard, BarCard } from '@/components/charts/charts';
import { money, percent, todayISO } from '@/lib/format';
import { paymentMethod } from '@/lib/labels';

export const metadata = { title: 'Financeiro' };

export default async function FinancePanel({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const ctx = await requirePermission('finance.view');
  const sp = await searchParams;
  const period = resolvePeriod(sp, todayISO(ctx.tz));
  const [summary, charts, report, forecast] = await Promise.all([
    ctx.supabase.rpc('dashboard_summary', { p_org: ctx.org.id, p_unit: ctx.unitId, p_from: period.from, p_to: period.to }),
    ctx.supabase.rpc('dashboard_charts', { p_org: ctx.org.id, p_unit: ctx.unitId, p_months: 12 }),
    ctx.can('reports.view') ? ctx.supabase.rpc('report_finance', { p_org: ctx.org.id, p_unit: ctx.unitId, p_from: period.from, p_to: period.to }) : Promise.resolve({ data: null, error: null }),
    ctx.supabase.from('accounts_receivable').select('amount, discount, surcharge, status').eq('organization_id', ctx.org.id).gte('due_date', period.from).lte('due_date', period.to).neq('status', 'cancelled'),
  ]);
  if (summary.error) return <ErrorState />;
  const s = summary.data as any;
  const expected = ((forecast.data ?? []) as any[]).reduce((t, r) => t + Number(r.amount) - Number(r.discount) + Number(r.surcharge), 0);
  const monthly = (((charts.data as any)?.monthly ?? []) as any[]).map((m) => ({ mes: m.month.slice(5) + '/' + m.month.slice(2, 4), receita: Number(m.revenue ?? 0), despesa: Number(m.expenses ?? 0), resultado: Number(m.revenue ?? 0) - Number(m.expenses ?? 0) }));
  const r = report.data as any;
  return (
    <>
      <PageHeader title="Painel financeiro" description="Receitas, despesas, resultado e indicadores do período." actions={<PeriodFilter {...period} />} />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Receita realizada" value={money(s.revenue)} icon={TrendingUp} tone="success" />
        <StatCard label="Despesas" value={money(s.expenses)} icon={TrendingDown} tone="warning" />
        <StatCard label="Resultado" value={money(s.result)} icon={Scale} tone={Number(s.result) >= 0 ? 'success' : 'danger'} />
        <StatCard label="Receita prevista no período" value={money(expected)} icon={Target} hint="Títulos com vencimento no período" />
        <StatCard label="Contas a receber (aberto)" value={money(s.receivable_open)} icon={HandCoins} href="/app/financeiro/receber" />
        <StatCard label="Contas a pagar (aberto)" value={money(s.payable_open)} icon={Receipt} href="/app/financeiro/pagar" />
        <StatCard label="Inadimplência" value={percent(s.default_rate)} icon={AlertTriangle} tone={Number(s.default_rate) > 10 ? 'danger' : 'default'} hint={`${money(s.overdue_amount)} vencidos · ${s.overdue_count} títulos`} href="/app/financeiro/inadimplencia" />
        <StatCard label="Ticket médio" value={money(s.average_ticket)} icon={Wallet} />
      </div>
      <div className="mt-6 grid gap-4 xl:grid-cols-2">
        <ComboCard title="Receita × despesa (12 meses)" data={monthly} x="mes" bars={[{ key: 'receita', label: 'Receita' }, { key: 'despesa', label: 'Despesa' }]} lines={[{ key: 'resultado', label: 'Resultado' }]} format="money" />
        {r && <BarCard title="Receita por forma de pagamento" data={(r.by_method ?? []).map((x: any) => ({ forma: paymentMethod[x.method] ?? x.method, total: Number(x.total) }))} x="forma" series={[{ key: 'total', label: 'Total' }]} format="money" />}
        {r && <BarCard title="Receita por plano" data={(r.by_plan ?? []).map((x: any) => ({ plano: x.plan, total: Number(x.total) }))} x="plano" series={[{ key: 'total', label: 'Total' }]} format="money" />}
        {r && <BarCard title="Movimentação por categoria" data={(r.by_category ?? []).slice(0, 10).map((x: any) => ({ categoria: x.category, entrada: x.type === 'in' ? Number(x.total) : 0, saida: x.type === 'out' ? Number(x.total) : 0 }))} x="categoria" series={[{ key: 'entrada', label: 'Entradas' }, { key: 'saida', label: 'Saídas' }]} format="money" />}
      </div>
    </>
  );
}

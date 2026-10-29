import Link from 'next/link';
import { Download } from 'lucide-react';
import { requirePermission } from '@/lib/auth/context';
import { PageHeader, StatCard, ErrorState, Section, Table, Th, Td, Tr, EmptyState } from '@/components/ui/misc';
import { Badge } from '@/components/ui/badge';
import { PeriodFilter } from '@/components/app/period-filter';
import { resolvePeriod } from '@/components/app/period';
import { BarCard } from '@/components/charts/charts';
import { money, percent, todayISO, dateTime, date as fmtDate, WEEKDAYS_SHORT } from '@/lib/format';
import { patientStatus, origin as originLabel, paymentMethod, leadStage, label } from '@/lib/labels';
import { cn, whatsappLink } from '@/lib/utils';

export const metadata = { title: 'Relatórios' };

const TABS = [
  { id: 'administrativo', label: 'Administrativo', perm: 'patients.view' },
  { id: 'agenda', label: 'Agenda', perm: 'schedule.view' },
  { id: 'profissionais', label: 'Profissionais', perm: null },
  { id: 'financeiro', label: 'Financeiro', perm: 'finance.view' },
  { id: 'marketing', label: 'Marketing', perm: 'crm.view' },
] as const;

export default async function Reports({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const ctx = await requirePermission('reports.view');
  const sp = await searchParams;
  const period = resolvePeriod(sp, todayISO(ctx.tz));
  const tabs = TABS.filter((t) => !t.perm || ctx.can(t.perm));
  const tab = tabs.find((t) => t.id === sp.aba)?.id ?? tabs[0]?.id;
  const canExport = ctx.can('reports.export');
  const qs = (extra: Record<string, string>) => new URLSearchParams({ ...(sp.periodo ? { periodo: sp.periodo } : {}), ...(sp.de ? { de: sp.de } : {}), ...(sp.ate ? { ate: sp.ate } : {}), ...extra }).toString();
  const exp = (kind: string) => canExport ? (
    <span className="flex gap-2">
      <a href={`/api/export/report?kind=${kind}&from=${period.from}&to=${period.to}&format=xlsx`} className="inline-flex items-center gap-1 text-sm text-primary hover:underline"><Download className="h-4 w-4" />Excel</a>
      <a href={`/api/export/report?kind=${kind}&from=${period.from}&to=${period.to}&format=csv`} className="text-sm text-primary hover:underline">CSV</a>
    </span>
  ) : undefined;
  const args = { p_org: ctx.org.id, p_unit: ctx.unitId, p_from: period.from, p_to: period.to };

  let body: React.ReactNode = null;
  if (!tab) body = <EmptyState title="Sem relatórios disponíveis" description="Seu perfil não tem acesso aos módulos com relatórios." />;
  else if (tab === 'administrativo') {
    const [{ data, error }, risk, noPlan] = await Promise.all([
      ctx.supabase.rpc('report_admin', args),
      ctx.supabase.rpc('patient_risk', { p_org: ctx.org.id, p_unit: ctx.unitId }),
      ctx.supabase.rpc('report_patients_without_plan', { p_org: ctx.org.id, p_unit: ctx.unitId }),
    ]);
    if (error) return <ErrorState />;
    const d = data as any;
    const r = ((risk.data ?? []) as any[]).filter((x) => x.level !== 'Baixo');
    const np = (noPlan.data ?? []) as any[];
    body = (
      <div className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard label="Ativos" value={d.by_status?.active ?? 0} />
          <StatCard label="Inativos / cancelados" value={(d.by_status?.inactive ?? 0) + (d.by_status?.cancelled ?? 0)} />
          <StatCard label="Novos no período" value={d.new_patients} tone="success" />
          <StatCard label="Planos cancelados no período" value={d.cancelled_subscriptions} tone={d.cancelled_subscriptions > 0 ? 'warning' : 'default'} />
        </div>
        <div className="grid gap-6 xl:grid-cols-3">
          <BarCard title="Alunos por status" data={Object.entries(d.by_status ?? {}).map(([k, v]) => ({ status: label(patientStatus, k), alunos: v }))} x="status" series={[{ key: 'alunos', label: 'Alunos' }]} />
          <BarCard title="Ativos por faixa etária" data={(d.by_age ?? []).map((x: any) => ({ faixa: x.faixa, alunos: x.n }))} x="faixa" series={[{ key: 'alunos', label: 'Alunos' }]} />
          <BarCard title="Assinaturas ativas por plano" data={(d.active_by_plan ?? []).map((x: any) => ({ plano: x.plan, alunos: x.n }))} x="plano" series={[{ key: 'alunos', label: 'Assinaturas' }]} />
          <BarCard title="Novos alunos por origem" data={(d.by_origin ?? []).map((x: any) => ({ origem: label(originLabel, x.origin), alunos: x.n }))} x="origem" series={[{ key: 'alunos', label: 'Alunos' }]} />
          <Section title="Motivos de cancelamento" className="xl:col-span-2">
            {(d.cancel_reasons ?? []).length === 0 ? <p className="text-sm text-muted-foreground">Nenhum cancelamento no período.</p> : (
              <ul className="space-y-1 text-sm">{d.cancel_reasons.map((c: any) => <li key={c.reason} className="flex justify-between"><span>{c.reason}</span><span className="font-medium">{c.n}</span></li>)}</ul>
            )}
          </Section>
        </div>
        <div className="grid gap-6 xl:grid-cols-2">
          <Section title={`Risco de evasão (${r.length})`} description="Pontuação por regras: faltas, queda de frequência, sem aula futura, plano vencendo, atraso, ausência prolongada." actions={exp('alunos-risco')}>
            {r.length === 0 ? <p className="text-sm text-muted-foreground">Nenhum aluno em risco médio/alto.</p> : (
              <Table><thead><tr><Th>Aluno</Th><Th>Risco</Th><Th>Motivos</Th></tr></thead><tbody>
                {r.slice(0, 50).map((x) => <Tr key={x.patient_id}><Td><Link className="hover:text-primary" href={`/app/alunos/${x.patient_id}`}>{x.full_name}</Link></Td><Td><Badge variant={x.level === 'Alto' ? 'danger' : 'warning'}>{x.level} ({x.score})</Badge></Td><Td className="text-xs text-muted-foreground">{(x.reasons ?? []).join(' · ')}</Td></Tr>)}
              </tbody></Table>
            )}
          </Section>
          <Section title={`Ativos sem plano (${np.length})`} actions={exp('alunos-sem-plano')}>
            {np.length === 0 ? <p className="text-sm text-muted-foreground">Todos os alunos ativos possuem plano.</p> : (
              <Table><thead><tr><Th>Aluno</Th><Th>Último plano</Th><Th>Última presença</Th></tr></thead><tbody>
                {np.slice(0, 50).map((x) => <Tr key={x.id}><Td><Link className="hover:text-primary" href={`/app/alunos/${x.id}?aba=financeiro`}>{x.full_name}</Link></Td><Td>{x.last_plan ?? '—'}{x.last_end ? ` (até ${fmtDate(x.last_end)})` : ''}</Td><Td>{x.last_attendance ? dateTime(x.last_attendance, ctx.tz) : '—'}</Td></Tr>)}
              </tbody></Table>
            )}
          </Section>
          <Section title="Aniversariantes do mês">
            {(d.birthdays_month ?? []).length === 0 ? <p className="text-sm text-muted-foreground">Nenhum aniversariante.</p> : (
              <ul className="grid gap-1 text-sm sm:grid-cols-2">{d.birthdays_month.map((b: any) => <li key={b.id} className="flex justify-between gap-2"><Link className="truncate hover:text-primary" href={`/app/alunos/${b.id}`}>{b.name}</Link><span className="text-muted-foreground">dia {b.day}{b.whatsapp && <a className="ml-2 text-primary" target="_blank" rel="noopener noreferrer" href={whatsappLink(b.whatsapp) ?? '#'}>WhatsApp</a>}</span></li>)}</ul>
            )}
          </Section>
        </div>
      </div>
    );
  } else if (tab === 'agenda') {
    const { data, error } = await ctx.supabase.rpc('report_schedule', args);
    if (error) return <ErrorState />;
    const d = data as any; const t = d.totals ?? {};
    const hours = Array.from(new Set((d.by_slot ?? []).map((x: any) => x.hour))).sort((a: any, b: any) => a - b) as number[];
    const cell = (wd: number, h: number) => (d.by_slot ?? []).find((x: any) => x.weekday === wd && x.hour === h);
    const att = Number(t.presences) + Number(t.absences);
    body = (
      <div className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard label="Sessões realizadas/agendadas" value={t.sessions ?? 0} hint={`${t.cancelled_sessions ?? 0} sessões canceladas`} />
          <StatCard label="Presença" value={percent(att ? (100 * t.presences) / att : null)} hint={`${t.presences} presenças · ${t.absences} faltas`} />
          <StatCard label="Cancelamentos de alunos" value={t.cancellations ?? 0} hint={`${t.replacements ?? 0} reposições`} />
          <StatCard label="Horários vazios × lotados" value={`${d.empty_sessions} / ${d.full_sessions}`} />
        </div>
        <Section title="Ocupação por dia e horário" description="% de vagas ocupadas. Cores mais fortes = horários mais cheios." actions={exp('agenda-horarios')}>
          {hours.length === 0 ? <p className="text-sm text-muted-foreground">Sem sessões no período.</p> : (
            <div className="overflow-x-auto">
              <table className="text-xs">
                <thead><tr><th className="p-1" />{[1, 2, 3, 4, 5, 6, 0].map((w) => <th key={w} className="p-1 font-medium">{WEEKDAYS_SHORT[w]}</th>)}</tr></thead>
                <tbody>{hours.map((h) => (
                  <tr key={h}><th className="p-1 pr-2 text-right font-medium tabular-nums">{String(h).padStart(2, '0')}h</th>
                    {[1, 2, 3, 4, 5, 6, 0].map((w) => { const c = cell(w, h); const pct = c && c.capacity ? Math.round((100 * c.booked) / c.capacity) : null; return (
                      <td key={w} className="p-0.5"><div title={c ? `${c.sessions} sessões · ${c.booked}/${c.capacity} vagas` : 'Sem sessões'} className={cn('flex h-8 w-14 items-center justify-center rounded tabular-nums', pct == null ? 'bg-muted/40 text-muted-foreground/50' : '')} style={pct != null ? { background: `hsl(var(--primary) / ${0.12 + (pct / 100) * 0.75})`, color: pct > 55 ? 'white' : undefined } : undefined}>{pct == null ? '—' : `${pct}%`}</div></td>
                    ); })}</tr>
                ))}</tbody>
              </table>
            </div>
          )}
        </Section>
        <Section title="Por modalidade" actions={exp('agenda-modalidades')}>
          <Table><thead><tr><Th>Modalidade</Th><Th className="text-right">Sessões</Th><Th className="text-right">Presenças</Th><Th className="text-right">Faltas</Th></tr></thead><tbody>
            {(d.by_service ?? []).map((x: any) => <Tr key={x.service}><Td>{x.service}</Td><Td className="text-right">{x.sessions}</Td><Td className="text-right">{x.presences}</Td><Td className="text-right">{x.absences}</Td></Tr>)}
          </tbody></Table>
        </Section>
      </div>
    );
  } else if (tab === 'profissionais') {
    const { data, error } = await ctx.supabase.rpc('report_staff', args);
    if (error) return <ErrorState />;
    const rows = (data ?? []) as any[];
    body = (
      <div className="space-y-6">
        <BarCard title="Atendimentos por profissional" data={rows.map((r) => ({ profissional: r.staff, atendimentos: Number(r.sessions), horas: Number(r.hours) }))} x="profissional" series={[{ key: 'atendimentos', label: 'Atendimentos' }, { key: 'horas', label: 'Horas' }]} />
        <Section title="Produtividade" actions={exp('profissionais')}>
          {rows.length === 0 ? <p className="text-sm text-muted-foreground">Sem atendimentos no período.</p> : (
            <Table><thead><tr><Th>Profissional</Th><Th className="text-right">Atendimentos</Th><Th className="text-right">Horas</Th><Th className="text-right">Presenças</Th><Th className="text-right">Faltas</Th><Th className="text-right">Ocupação</Th>{ctx.can('commissions.view') && <Th className="text-right">Comissões</Th>}</tr></thead><tbody>
              {rows.map((r) => <Tr key={r.id}><Td><Link href={`/app/equipe/${r.id}`} className="hover:text-primary">{r.staff}</Link></Td><Td className="text-right">{r.sessions}</Td><Td className="text-right">{r.hours}</Td><Td className="text-right">{r.presences}</Td><Td className="text-right">{r.absences}</Td><Td className="text-right">{percent(r.occupancy)}</Td>{ctx.can('commissions.view') && <Td className="text-right">{money(r.commissions)}</Td>}</Tr>)}
            </tbody></Table>
          )}
        </Section>
      </div>
    );
  } else if (tab === 'financeiro') {
    const { data, error } = await ctx.supabase.rpc('report_finance', args);
    if (error) return <ErrorState />;
    const d = data as any;
    body = (
      <div className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard label="Receita" value={money(d.revenue)} tone="success" />
          <StatCard label="Despesas" value={money(d.expenses)} tone="warning" hint={`Estornos ${money(d.refunds)}`} />
          <StatCard label="Resultado" value={money(Number(d.revenue) - Number(d.expenses) - Number(d.refunds))} tone={Number(d.revenue) - Number(d.expenses) >= 0 ? 'success' : 'danger'} />
          <StatCard label="Inadimplência atual" value={money(d.default?.overdue_amount)} tone="danger" hint={`${d.default?.overdue_count ?? 0} títulos`} href="/app/financeiro/inadimplencia" />
        </div>
        <div className="grid gap-6 xl:grid-cols-2">
          <BarCard title="Receita por forma de pagamento" data={(d.by_method ?? []).map((x: any) => ({ forma: label(paymentMethod, x.method), total: Number(x.total) }))} x="forma" series={[{ key: 'total', label: 'Total' }]} format="money" />
          <BarCard title="Receita por plano" data={(d.by_plan ?? []).map((x: any) => ({ plano: x.plan, total: Number(x.total) }))} x="plano" series={[{ key: 'total', label: 'Total' }]} format="money" />
          {ctx.units.length > 1 && <BarCard title="Receita por unidade" data={(d.by_unit ?? []).map((x: any) => ({ unidade: x.unit, total: Number(x.total) }))} x="unidade" series={[{ key: 'total', label: 'Total' }]} format="money" />}
          <BarCard title="Receita estimada por profissional" data={(d.by_staff ?? []).map((x: any) => ({ profissional: x.staff, total: Number(x.total) }))} x="profissional" series={[{ key: 'total', label: 'Receita' }]} format="money" />
        </div>
        <div className="grid gap-6 xl:grid-cols-2">
          <Section title="Por categoria" actions={exp('financeiro-categorias')}>
            <Table><thead><tr><Th>Categoria</Th><Th>Tipo</Th><Th className="text-right">Total</Th></tr></thead><tbody>
              {(d.by_category ?? []).map((x: any, i: number) => <Tr key={i}><Td>{x.category}</Td><Td>{x.type === 'in' ? <Badge variant="success">Entrada</Badge> : <Badge variant="warning">Saída</Badge>}</Td><Td className="text-right">{money(x.total)}</Td></Tr>)}
            </tbody></Table>
          </Section>
          <Section title="Receita estimada por profissional" description="Valor da sessão (preço do plano ÷ aulas do plano, ou preço avulso da modalidade) × aulas atendidas." actions={exp('financeiro-profissionais')}>
            <Table><thead><tr><Th>Profissional</Th><Th className="text-right">Aulas</Th><Th className="text-right">Receita</Th></tr></thead><tbody>
              {(d.by_staff ?? []).map((x: any) => <Tr key={x.staff}><Td>{x.staff}</Td><Td className="text-right">{x.attended}</Td><Td className="text-right">{money(x.total)}</Td></Tr>)}
            </tbody></Table>
          </Section>
        </div>
        <p className="text-sm text-muted-foreground">Mais detalhes: <Link className="text-primary hover:underline" href="/app/financeiro/fluxo-caixa">Fluxo de caixa</Link> · <Link className="text-primary hover:underline" href="/app/financeiro/receber">Contas a receber</Link> · <Link className="text-primary hover:underline" href="/app/financeiro/comissoes">Comissões</Link></p>
      </div>
    );
  } else if (tab === 'marketing') {
    const { data, error } = await ctx.supabase.rpc('report_marketing', { p_org: ctx.org.id, p_from: period.from, p_to: period.to });
    if (error) return <ErrorState />;
    const d = data as any;
    body = (
      <div className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard label="Leads no período" value={d.leads} />
          <StatCard label="Experimentais agendadas" value={d.trials?.scheduled ?? 0} hint={`${d.trials?.attended ?? 0} compareceram`} />
          <StatCard label="Conversão de experimentais" value={percent(d.trials?.conversion_rate)} tone="success" hint={`${d.trials?.converted ?? 0} matrículas`} />
          <StatCard label="Custo por aquisição" value={money(d.cost_per_acquisition)} hint="Com base no custo informado nos leads" />
        </div>
        <div className="grid gap-6 xl:grid-cols-2">
          <BarCard title="Leads e matrículas por origem" data={(d.by_origin ?? []).map((x: any) => ({ origem: label(originLabel, x.origin), leads: x.leads, matriculas: x.enrolled }))} x="origem" series={[{ key: 'leads', label: 'Leads' }, { key: 'matriculas', label: 'Matrículas' }]} />
          <BarCard title="Funil (etapa atual)" data={Object.entries(d.by_stage ?? {}).map(([k, v]) => ({ etapa: label(leadStage, k), leads: v }))} x="etapa" series={[{ key: 'leads', label: 'Leads' }]} />
          <Section title="Conversão por origem" actions={exp('origem-leads')}>
            <Table><thead><tr><Th>Origem</Th><Th className="text-right">Leads</Th><Th className="text-right">Matrículas</Th><Th className="text-right">Conversão</Th><Th className="text-right">Custo médio</Th></tr></thead><tbody>
              {(d.by_origin ?? []).map((x: any) => <Tr key={x.origin}><Td>{label(originLabel, x.origin)}</Td><Td className="text-right">{x.leads}</Td><Td className="text-right">{x.enrolled}</Td><Td className="text-right">{percent(x.conversion)}</Td><Td className="text-right">{money(x.avg_cost)}</Td></Tr>)}
            </tbody></Table>
          </Section>
          <Section title="Motivos de perda">
            {(d.lost_reasons ?? []).length === 0 ? <p className="text-sm text-muted-foreground">Nenhum lead perdido no período.</p> : (
              <ul className="space-y-1 text-sm">{d.lost_reasons.map((x: any) => <li key={x.reason} className="flex justify-between"><span>{x.reason}</span><span className="font-medium">{x.n}</span></li>)}</ul>
            )}
          </Section>
        </div>
      </div>
    );
  }

  return (
    <>
      <PageHeader title="Relatórios" description="Indicadores por período e unidade selecionada. Exportações ficam registradas na auditoria." actions={<PeriodFilter {...period} />} />
      <nav aria-label="Relatórios" className="mb-6 flex gap-1 overflow-x-auto border-b">
        {tabs.map((t) => (
          <Link key={t.id} href={`/app/relatorios?${qs({ aba: t.id })}`} aria-current={tab === t.id ? 'page' : undefined}
            className={cn('-mb-px whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-medium', tab === t.id ? 'border-primary' : 'border-transparent text-muted-foreground hover:text-foreground')}>{t.label}</Link>
        ))}
      </nav>
      {body}
    </>
  );
}

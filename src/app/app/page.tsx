import Link from 'next/link';
import { Users, CalendarDays, CalendarRange, Gauge, CheckCircle2, XCircle, RotateCcw, TrendingUp, Scale, AlertTriangle, Wallet, Cake, Wrench, ClipboardCheck, PhoneCall, FileWarning, Sparkles } from 'lucide-react';
import { requirePermission } from '@/lib/auth/context';
import { PageHeader, StatCard, ErrorState, Section, EmptyState } from '@/components/ui/misc';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { PeriodFilter } from '@/components/app/period-filter';
import { resolvePeriod } from '@/components/app/period';
import { BarCard, LineCard, ComboCard } from '@/components/charts/charts';
import { money, percent, todayISO, date as fmtDate, time, localToISO, addDaysISO } from '@/lib/format';
import { participantStatus, participantStatusColor, leadStage } from '@/lib/labels';
import { whatsappLink, cn } from '@/lib/utils';

export const metadata = { title: 'Dashboard' };

type L = Record<string, any[] | undefined>;

export default async function Dashboard({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const ctx = await requirePermission('dashboard.view');
  const sp = await searchParams;
  const today = todayISO(ctx.tz);
  const period = resolvePeriod(sp, today);
  const canSchedule = ctx.can('schedule.view');
  const canPatients = ctx.can('patients.view');

  const dayQuery = canSchedule
    ? (() => {
        let q = ctx.supabase.from('appointments')
          .select('id, starts_at, ends_at, status, kind, capacity, service:services(name, color), staff:staff(full_name), room:rooms(name), participants:appointment_participants(id, status, patient_id, patient:patients(full_name, social_name))')
          .eq('organization_id', ctx.org.id).neq('status', 'cancelled')
          .gte('starts_at', localToISO(today, '00:00', ctx.tz)).lt('starts_at', localToISO(addDaysISO(today, 1), '00:00', ctx.tz)).order('starts_at').limit(200);
        if (ctx.unitId) q = q.eq('unit_id', ctx.unitId);
        return q;
      })()
    : Promise.resolve({ data: [], error: null });

  const [summary, charts, lists, risk, day] = await Promise.all([
    ctx.supabase.rpc('dashboard_summary', { p_org: ctx.org.id, p_unit: ctx.unitId, p_from: period.from, p_to: period.to }),
    ctx.supabase.rpc('dashboard_charts', { p_org: ctx.org.id, p_unit: ctx.unitId, p_months: 6 }),
    ctx.supabase.rpc('dashboard_lists', { p_org: ctx.org.id, p_unit: ctx.unitId }),
    canPatients ? ctx.supabase.rpc('patient_risk', { p_org: ctx.org.id, p_unit: ctx.unitId }) : Promise.resolve({ data: [], error: null }),
    dayQuery,
  ]);
  if (summary.error) return <ErrorState description="Não foi possível carregar os indicadores. Tente novamente." />;
  const s = summary.data as any;
  const l = (lists.data ?? {}) as L;
  const monthly = (((charts.data as any)?.monthly ?? []) as any[]).map((m) => ({
    mes: m.month.slice(5) + '/' + m.month.slice(2, 4),
    receita: Number(m.revenue ?? 0), despesa: Number(m.expenses ?? 0),
    novos: Number(m.new_patients ?? 0), cancelamentos: Number(m.cancellations ?? 0),
    presenca: m.attendance_rate == null ? null : Number(m.attendance_rate),
    ocupacao: m.occupancy_rate == null ? null : Number(m.occupancy_rate),
    churn: Number(m.active_at_start) > 0 ? Math.round((1000 * Number(m.churned)) / Number(m.active_at_start)) / 10 : 0,
    inad: m.default_rate == null ? null : Number(m.default_rate),
  }));
  const byHour = (((charts.data as any)?.occupancy_by_hour ?? []) as any[]).map((h) => ({ hora: `${String(h.hour).padStart(2, '0')}h`, ocupacao: Number(h.occupancy ?? 0) }));
  const byStaff = (((charts.data as any)?.occupancy_by_staff ?? []) as any[]).map((h) => ({ profissional: String(h.staff).split(' ')[0], ocupacao: Number(h.occupancy ?? 0) }));
  const riskHigh = ((risk.data ?? []) as any[]).filter((r) => r.level !== 'Baixo').slice(0, 8);
  const appts = (day.data ?? []) as any[];
  const firstName = (ctx.profile?.full_name ?? '').split(' ')[0];
  const hour = Number(new Intl.DateTimeFormat('pt-BR', { hour: 'numeric', hour12: false, timeZone: ctx.tz }).format(new Date()));
  const greet = hour < 12 ? 'Bom dia' : hour < 18 ? 'Boa tarde' : 'Boa noite';

  return (
    <>
      <PageHeader title={`${greet}${firstName ? `, ${firstName}` : ''}`} description={`${ctx.org.name}${ctx.unitId ? ` · ${ctx.units.find((u) => u.id === ctx.unitId)?.name ?? ''}` : ctx.units.length > 1 ? ' · todas as unidades' : ''}`} actions={<PeriodFilter {...period} />} />

      {!ctx.org.onboarding_completed_at && ctx.can('settings.edit') && (
        <div className="mb-6 flex flex-col items-start justify-between gap-3 rounded-2xl border border-primary/30 bg-primary-soft/60 p-5 sm:flex-row sm:items-center">
          <div className="flex items-start gap-3"><Sparkles className="mt-0.5 h-5 w-5 text-primary" /><div><p className="font-medium">Conclua a configuração inicial</p><p className="text-sm text-muted-foreground">Faltam alguns passos para deixar a clínica pronta (etapa {ctx.org.onboarding_step} de 10).</p></div></div>
          <Link href="/onboarding"><Button>Continuar configuração</Button></Link>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Alunos ativos" value={s.active_patients ?? 0} icon={Users} href="/app/alunos?status=active" hint={`${s.new_patients ?? 0} novos no período · ${s.trial_patients ?? 0} experimentais`} />
        <StatCard label="Aulas hoje" value={s.classes_today ?? 0} icon={CalendarDays} href="/app/agenda?vis=dia" hint={`${s.classes_week ?? 0} na semana`} />
        <StatCard label="Taxa de ocupação" value={percent(s.occupancy_rate)} icon={Gauge} hint="Vagas ocupadas / capacidade no período" />
        <StatCard label="Presenças × faltas" value={`${s.presences ?? 0} / ${s.absences ?? 0}`} icon={CheckCircle2} hint={`${s.cancellations ?? 0} cancelamentos no período`} tone={(s.absences ?? 0) > (s.presences ?? 0) / 4 ? 'warning' : 'default'} />
        <StatCard label="Reposições pendentes" value={s.pending_replacements ?? 0} icon={RotateCcw} href="/app/agenda" />
        <StatCard label="Alunos inativos / pausados" value={`${s.inactive_patients ?? 0} / ${s.paused_patients ?? 0}`} icon={XCircle} href="/app/alunos?status=inactive" />
        {s.finance_visible && <>
          <StatCard label="Faturamento no período" value={money(s.revenue)} icon={TrendingUp} tone="success" href="/app/financeiro" hint={`Ticket médio ${money(s.average_ticket)}`} />
          <StatCard label="Resultado" value={money(s.result)} icon={Scale} tone={Number(s.result) >= 0 ? 'success' : 'danger'} hint={`Despesas ${money(s.expenses)}`} />
          <StatCard label="Inadimplência" value={percent(s.default_rate)} icon={AlertTriangle} tone={Number(s.default_rate) > 10 ? 'danger' : 'default'} href="/app/financeiro/inadimplencia" hint={`${money(s.overdue_amount)} em ${s.overdue_count ?? 0} títulos`} />
          <StatCard label="A receber (aberto)" value={money(s.receivable_open)} icon={Wallet} href="/app/financeiro/receber" hint={`A pagar ${money(s.payable_open)}`} />
        </>}
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-3">
        {canSchedule && (
          <Section title="Agenda de hoje" className="xl:col-span-2" actions={<Link href="/app/agenda?vis=dia" className="text-sm text-primary hover:underline">Abrir agenda</Link>}>
            {appts.length === 0 ? <EmptyState icon={CalendarRange} title="Nenhuma aula hoje" description="Os atendimentos do dia aparecem aqui." /> : (
              <ul className="divide-y">
                {appts.map((a) => {
                  const parts = (a.participants ?? []).filter((p: any) => p.status !== 'cancelled');
                  return (
                    <li key={a.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-start">
                      <Link href={`/app/agenda?vis=dia&ag=${a.id}`} className="flex w-28 shrink-0 items-center gap-2 font-medium tabular-nums hover:text-primary">
                        <span className="h-8 w-1 rounded-full" style={{ background: a.service?.color ?? 'hsl(var(--primary))' }} />
                        {time(a.starts_at, ctx.tz)}–{time(a.ends_at, ctx.tz)}
                      </Link>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium">{a.service?.name ?? 'Atendimento'}{a.kind === 'trial' && <Badge variant="info" className="ml-2">Experimental</Badge>} <span className="font-normal text-muted-foreground">· {a.staff?.full_name ?? 'Sem profissional'}{a.room?.name ? ` · ${a.room.name}` : ''} · {parts.length}/{a.capacity}</span></p>
                        <div className="mt-1 flex flex-wrap gap-1">
                          {parts.map((p: any) => (
                            <Link key={p.id} href={`/app/alunos/${p.patient_id}`} className={cn('rounded-full border px-2 py-0.5 text-xs', participantStatusColor[p.status])} title={participantStatus[p.status]}>
                              {p.patient?.social_name || p.patient?.full_name}
                            </Link>
                          ))}
                          {parts.length === 0 && <span className="text-xs text-muted-foreground">Sem alunos</span>}
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </Section>
        )}

        <div className="space-y-6">
          {canPatients && (
            <Section title="Risco de evasão" description="Indicativo por regras transparentes (faltas, frequência, plano, pagamentos)." actions={<Link href="/app/alunos?risco=1" className="text-sm text-primary hover:underline">Ver todos</Link>}>
              {riskHigh.length === 0 ? <p className="text-sm text-muted-foreground">Nenhum aluno com risco médio ou alto. 🎉</p> : (
                <ul className="space-y-3">
                  {riskHigh.map((r) => (
                    <li key={r.patient_id}>
                      <div className="flex items-center justify-between gap-2">
                        <Link href={`/app/alunos/${r.patient_id}`} className="truncate text-sm font-medium hover:text-primary">{r.full_name}</Link>
                        <Badge variant={r.level === 'Alto' ? 'danger' : 'warning'}>{r.level}</Badge>
                      </div>
                      <p className="text-xs text-muted-foreground">{(r.reasons ?? []).join(' · ')}</p>
                    </li>
                  ))}
                </ul>
              )}
            </Section>
          )}
          {l.leads_waiting && (
            <ListBox title="Leads aguardando contato" icon={PhoneCall} href="/app/crm" items={l.leads_waiting} render={(x) => (
              <><Link href={`/app/crm?lead=${x.id}`} className="truncate hover:text-primary">{x.name}</Link><span className="flex items-center gap-2 text-xs text-muted-foreground">{leadStage[x.stage] ?? x.stage}{x.phone && <a href={whatsappLink(x.phone) ?? '#'} target="_blank" rel="noopener noreferrer" className="text-primary">WhatsApp</a>}</span></>
            )} />
          )}
        </div>
      </div>

      <div className="mt-6 grid gap-6 md:grid-cols-2 xl:grid-cols-3">
        {l.overdue_payments && <ListBox title="Pagamentos em atraso" icon={AlertTriangle} href="/app/financeiro/inadimplencia" items={l.overdue_payments} render={(x) => (
          <><Link href={`/app/alunos/${x.patient_id}?aba=financeiro`} className="truncate hover:text-primary">{x.name}</Link><span className="text-xs"><span className="font-medium text-destructive">{money(x.amount)}</span> · {x.days}d</span></>
        )} />}
        {l.plans_expiring && <ListBox title="Planos vencendo / sessões acabando" icon={FileWarning} href="/app/planos" items={l.plans_expiring} render={(x) => (
          <><Link href={`/app/alunos/${x.patient_id}?aba=financeiro`} className="truncate hover:text-primary">{x.name}</Link><span className="text-xs text-muted-foreground">{x.sessions_left != null ? `${x.sessions_left} sessões` : fmtDate(x.end_date)}</span></>
        )} />}
        {l.contracts_expiring && <ListBox title="Contratos vencendo (30 dias)" icon={FileWarning} items={l.contracts_expiring} render={(x) => (
          <><Link href={`/app/alunos/${x.patient_id}?aba=documentos`} className="truncate hover:text-primary">{x.name}</Link><span className="text-xs text-muted-foreground">{fmtDate(x.end_date)}</span></>
        )} />}
        {l.birthdays && <ListBox title="Aniversariantes (7 dias)" icon={Cake} items={l.birthdays} render={(x) => (
          <><Link href={`/app/alunos/${x.id}`} className="truncate hover:text-primary">{x.name}</Link><span className="flex gap-2 text-xs text-muted-foreground">{x.date}{x.whatsapp && <a className="text-primary" target="_blank" rel="noopener noreferrer" href={whatsappLink(x.whatsapp, `Feliz aniversário, ${String(x.name).split(' ')[0]}! 🎉`) ?? '#'}>Parabenizar</a>}</span></>
        )} />}
        {l.frequent_absences && <ListBox title="Faltas frequentes (30 dias)" icon={XCircle} items={l.frequent_absences} render={(x) => (
          <><Link href={`/app/alunos/${x.id}?aba=agenda`} className="truncate hover:text-primary">{x.name}</Link><span className="text-xs text-destructive">{x.absences} faltas</span></>
        )} />}
        {l.reassessment_due && <ListBox title="Reavaliações pendentes" icon={ClipboardCheck} href="/app/avaliacoes" items={l.reassessment_due} render={(x) => (
          <><Link href={`/app/avaliacoes/nova?aluno=${x.id}`} className="truncate hover:text-primary">{x.name}</Link><span className="text-xs text-muted-foreground">{x.last ? `última ${fmtDate(x.last)}` : 'nunca avaliado'}</span></>
        )} />}
        {l.maintenance_due && <ListBox title="Manutenções próximas" icon={Wrench} href="/app/equipamentos" items={l.maintenance_due} render={(x) => (
          <><Link href={`/app/equipamentos?id=${x.id}`} className="truncate hover:text-primary">{x.name}</Link><span className={cn('text-xs', x.date < today ? 'text-destructive' : 'text-muted-foreground')}>{fmtDate(x.date)}</span></>
        )} />}
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        {s.finance_visible && <ComboCard title="Receita × despesa (6 meses)" data={monthly} x="mes" bars={[{ key: 'receita', label: 'Receita' }, { key: 'despesa', label: 'Despesa' }]} lines={[]} format="money" />}
        <BarCard title="Novos alunos × cancelamentos de plano" data={monthly} x="mes" series={[{ key: 'novos', label: 'Novos alunos' }, { key: 'cancelamentos', label: 'Cancelamentos' }]} />
        <LineCard title="Presença e ocupação (%)" data={monthly} x="mes" series={[{ key: 'presenca', label: 'Presença' }, { key: 'ocupacao', label: 'Ocupação' }]} format="percent" />
        <LineCard title={s.finance_visible ? 'Evasão e inadimplência (%)' : 'Evasão (%)'} data={monthly} x="mes" series={[{ key: 'churn', label: 'Evasão (churn)' }, ...(s.finance_visible ? [{ key: 'inad', label: 'Inadimplência' }] : [])]} format="percent" />
        {byHour.length > 0 && <BarCard title="Ocupação por horário (últimos 30 dias)" data={byHour} x="hora" series={[{ key: 'ocupacao', label: 'Ocupação %' }]} format="percent" />}
        {byStaff.length > 0 && <BarCard title="Ocupação por profissional (últimos 30 dias)" data={byStaff} x="profissional" series={[{ key: 'ocupacao', label: 'Ocupação %' }]} format="percent" />}
      </div>
    </>
  );
}

function ListBox({ title, icon: Icon, href, items, render }: { title: string; icon: React.ElementType; href?: string; items: any[]; render: (x: any) => React.ReactNode }) {
  return (
    <Section title={<span className="flex items-center gap-2"><Icon className="h-4 w-4 text-primary" />{title}</span>} actions={href ? <Link href={href} className="text-sm text-primary hover:underline">Ver</Link> : undefined}>
      {items.length === 0 ? <p className="text-sm text-muted-foreground">Nada pendente.</p> : (
        <ul className="space-y-2 text-sm">
          {items.slice(0, 8).map((x, i) => <li key={x.id ?? i} className="flex items-center justify-between gap-3">{render(x)}</li>)}
        </ul>
      )}
    </Section>
  );
}

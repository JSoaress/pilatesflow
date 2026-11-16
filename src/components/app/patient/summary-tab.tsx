import { CalendarCheck, CalendarClock, CalendarX, RefreshCw, Wallet, Percent, FileSignature, ShieldAlert } from 'lucide-react';
import { getAppContext } from '@/lib/auth/context';
import { StatCard, Section, EmptyState } from '@/components/ui/misc';
import { Badge } from '@/components/ui/badge';
import { dateTime, money, date, relative } from '@/lib/format';
import { label, participantStatus, contractStatus, paymentMethod } from '@/lib/labels';

type Event = { at: string; title: string; detail?: string; kind: string };

const EVENT_LABEL: Record<string, string> = {
  scheduled: 'Aula agendada', replacement_scheduled: 'Reposição agendada', cancelled: 'Cancelou a aula', session_cancelled: 'Aula cancelada pela clínica',
  checked_in: 'Check-in', completed: 'Aula concluída', absent: 'Falta', confirmed: 'Presença confirmada', rescheduled: 'Aula remarcada',
  waitlist_joined: 'Entrou na lista de espera', waitlist_notified: 'Avisado de vaga', trial_booked_online: 'Experimental agendada pelo site', status_changed: 'Status alterado',
};

export async function SummaryTab({ patientId, balance }: { patientId: string; balance: any }) {
  const ctx = await getAppContext();
  const now = new Date().toISOString();
  const since90 = new Date(Date.now() - 90 * 86400000).toISOString();
  const fin = ctx.can('finance.view');

  const [next, last, stats, debts, contract, risk, events, payments, subs, interactions, evolutions, assessments] = await Promise.all([
    ctx.supabase.from('appointment_participants').select('status, appointments!inner(starts_at, services(name), staff!appointments_staff_id_fkey(full_name))')
      .eq('patient_id', patientId).in('status', ['scheduled', 'confirmed', 'replacement']).gte('appointments.starts_at', now)
      .limit(150),
    ctx.supabase.from('appointment_participants').select('status, checked_in_at, appointments!inner(starts_at)')
      .eq('patient_id', patientId).in('status', ['present', 'completed']).lte('appointments.starts_at', now).limit(200),
    ctx.supabase.from('appointment_participants').select('status, appointments!inner(starts_at)').eq('patient_id', patientId)
      .gte('appointments.starts_at', since90).lte('appointments.starts_at', now),
    fin ? ctx.supabase.from('v_receivables').select('open_amount, status').eq('patient_id', patientId).in('status', ['overdue', 'partial', 'pending']) : Promise.resolve({ data: [] as any[] }),
    ctx.can('contracts.view') ? ctx.supabase.from('contracts').select('status, end_date, title').eq('patient_id', patientId).order('created_at', { ascending: false }).limit(1).maybeSingle() : Promise.resolve({ data: null }),
    ctx.supabase.rpc('patient_risk', { p_org: ctx.org.id, p_unit: null, p_patient: patientId }),
    ctx.supabase.from('appointment_events').select('event, details, created_at').eq('patient_id', patientId).order('created_at', { ascending: false }).limit(40),
    fin ? ctx.supabase.from('payments').select('amount, method, paid_at, status').eq('patient_id', patientId).order('paid_at', { ascending: false }).limit(15) : Promise.resolve({ data: [] as any[] }),
    ctx.supabase.from('subscriptions').select('created_at, status, start_date, plans(name)').eq('patient_id', patientId).order('created_at', { ascending: false }).limit(10),
    ctx.supabase.from('crm_interactions').select('channel, summary, occurred_at').eq('patient_id', patientId).order('occurred_at', { ascending: false }).limit(10),
    ctx.can('medical_records.view') ? ctx.supabase.from('clinical_evolutions').select('occurred_at, status, amends_id').eq('patient_id', patientId).order('occurred_at', { ascending: false }).limit(10) : Promise.resolve({ data: [] as any[] }),
    ctx.can('assessments.view') ? ctx.supabase.from('assessments').select('assessed_on, type').eq('patient_id', patientId).order('assessed_on', { ascending: false }).limit(5) : Promise.resolve({ data: [] as any[] }),
  ]);

  const nextList = ((next.data ?? []) as any[]).sort((a, b) => a.appointments.starts_at.localeCompare(b.appointments.starts_at));
  const nextAppt = nextList[0];
  const lastAttendance = ((last.data ?? []) as any[]).map((x) => x.appointments.starts_at).sort().pop();
  const st = (stats.data ?? []) as any[];
  const presences = st.filter((x) => ['present', 'completed'].includes(x.status)).length;
  const absences = st.filter((x) => x.status === 'absent').length;
  const cancels = st.filter((x) => x.status === 'cancelled').length;
  const frequency = presences + absences > 0 ? Math.round((presences / (presences + absences)) * 100) : null;
  const debt = ((debts.data ?? []) as any[]).reduce((s, r) => s + Number(r.open_amount || 0), 0);
  const overdue = ((debts.data ?? []) as any[]).some((r) => r.status === 'overdue');
  const riskRow = ((risk.data ?? []) as any[])[0];

  const timeline: Event[] = [
    ...((events.data ?? []) as any[]).map((e) => ({ at: e.created_at, kind: 'agenda', title: EVENT_LABEL[e.event] ?? e.event, detail: e.details?.reason ?? (e.details?.starts_at ? dateTime(e.details.starts_at, ctx.tz) : undefined) })),
    ...((payments.data ?? []) as any[]).map((p) => ({ at: p.paid_at, kind: 'financeiro', title: p.status === 'refunded' ? 'Pagamento estornado' : 'Pagamento recebido', detail: `${money(p.amount)} · ${label(paymentMethod, p.method)}` })),
    ...((subs.data ?? []) as any[]).map((s) => ({ at: s.created_at, kind: 'plano', title: `Plano contratado: ${s.plans?.name ?? ''}`, detail: `Início ${date(s.start_date)}` })),
    ...((interactions.data ?? []) as any[]).map((i) => ({ at: i.occurred_at, kind: 'contato', title: 'Contato registrado', detail: i.summary })),
    ...((evolutions.data ?? []) as any[]).map((e) => ({ at: e.occurred_at, kind: 'clínico', title: e.amends_id ? 'Adendo ao prontuário' : `Evolução clínica (${e.status === 'finalized' ? 'finalizada' : 'rascunho'})` })),
    ...((assessments.data ?? []) as any[]).map((a) => ({ at: a.assessed_on + 'T12:00:00', kind: 'avaliação', title: 'Avaliação realizada' })),
  ].sort((a, b) => b.at.localeCompare(a.at)).slice(0, 40);

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Saldo de aulas" icon={CalendarCheck} value={balance?.sessions_remaining ?? (balance?.subscription_id ? 'Ilimitado' : '—')}
          hint={balance?.plan_name ? `${balance.plan_name}${balance.end_date ? ` · até ${date(balance.end_date)}` : ''}` : 'Sem plano ativo'} />
        <StatCard label="Próxima aula" icon={CalendarClock} value={nextAppt ? dateTime(nextAppt.appointments.starts_at, ctx.tz) : '—'}
          hint={nextAppt ? `${nextAppt.appointments.services?.name ?? ''} · ${nextAppt.appointments.staff?.full_name ?? ''}` : 'Nenhuma aula futura'} />
        <StatCard label="Frequência (90 dias)" icon={Percent} value={frequency !== null ? `${frequency}%` : '—'}
          hint={`${presences} presenças · ${absences} faltas · ${cancels} cancel.`} tone={frequency !== null && frequency < 70 ? 'warning' : 'default'} />
        <StatCard label="Reposições disponíveis" icon={RefreshCw} value={balance?.replacement_credits ?? 0}
          hint={balance?.next_credit_expiration ? `Próximo vence ${date(balance.next_credit_expiration, ctx.tz)}` : undefined} />
        <StatCard label="Última aula" icon={CalendarX} value={lastAttendance ? date(lastAttendance, ctx.tz) : '—'} hint={lastAttendance ? relative(lastAttendance) : undefined} />
        {fin && <StatCard label="Débitos em aberto" icon={Wallet} value={money(debt)} tone={overdue ? 'danger' : 'default'} hint={overdue ? 'Possui valores vencidos' : undefined} href={`?aba=financeiro`} />}
        {contract.data && <StatCard label="Contrato" icon={FileSignature} value={label(contractStatus, (contract.data as any).status)} hint={(contract.data as any).end_date ? `Vence ${date((contract.data as any).end_date)}` : undefined} />}
        {riskRow && (
          <StatCard label="Risco de evasão" icon={ShieldAlert} value={riskRow.level}
            tone={riskRow.level === 'Alto' ? 'danger' : riskRow.level === 'Médio' ? 'warning' : 'success'}
            hint={(riskRow.reasons as string[]).slice(0, 2).join(' · ') || 'Nenhum sinal de risco'} />
        )}
      </div>

      {riskRow && (riskRow.reasons as string[]).length > 0 && (
        <div className="rounded-xl border border-warning/30 bg-warning-soft/50 p-4 text-sm">
          <p className="font-medium">Por que este aluno está em risco {riskRow.level.toLowerCase()}?</p>
          <ul className="mt-1 list-disc pl-5 text-muted-foreground">{(riskRow.reasons as string[]).map((r) => <li key={r}>{r}</li>)}</ul>
          <p className="mt-2 text-xs text-muted-foreground">Indicador baseado em regras transparentes. Nenhuma ação automática é tomada.</p>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <Section title="Linha do tempo">
          {timeline.length === 0 ? <EmptyState title="Sem eventos ainda" /> : (
            <ol className="relative space-y-4 border-l pl-5">
              {timeline.map((e, i) => (
                <li key={i} className="relative">
                  <span className="absolute -left-[25px] top-1.5 h-2.5 w-2.5 rounded-full border-2 border-card bg-primary" aria-hidden />
                  <p className="text-sm font-medium">{e.title} <Badge variant="neutral" className="ml-1">{e.kind}</Badge></p>
                  {e.detail && <p className="text-sm text-muted-foreground">{e.detail}</p>}
                  <p className="text-xs text-muted-foreground">{dateTime(e.at, ctx.tz)}</p>
                </li>
              ))}
            </ol>
          )}
        </Section>
        <Section title="Próximas aulas">
          {nextList.length === 0 ? <p className="text-sm text-muted-foreground">Nenhuma aula agendada.</p> : (
            <ul className="space-y-3">
              {nextList.slice(0, 8).map((n, i) => (
                <li key={i} className="text-sm">
                  <p className="font-medium">{dateTime(n.appointments.starts_at, ctx.tz)}</p>
                  <p className="text-muted-foreground">{n.appointments.services?.name} · {n.appointments.staff?.full_name ?? 'Sem profissional'} · {label(participantStatus, n.status)}</p>
                </li>
              ))}
            </ul>
          )}
        </Section>
      </div>
    </div>
  );
}

import Link from 'next/link';
import { getPortalContext } from '@/lib/auth/portal';
import { Section, EmptyState } from '@/components/ui/misc';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { dateTime } from '@/lib/format';
import { participantStatus } from '@/lib/labels';
import { PortalAppointmentActions } from '@/components/portal/appointment-actions';
import { LeaveWaitlistButton } from '@/components/portal/waitlist-button';

export const metadata = { title: 'Minhas aulas' };

export default async function PortalClasses() {
  const { supabase, me } = await getPortalContext();
  const [future, past, wl] = await Promise.all([
    supabase.rpc('portal_appointments', { p_patient_id: me.patient_id, p_from: new Date().toISOString(), p_to: new Date(Date.now() + 90 * 86400000).toISOString() }),
    supabase.rpc('portal_appointments', { p_patient_id: me.patient_id, p_from: new Date(Date.now() - 90 * 86400000).toISOString(), p_to: new Date().toISOString() }),
    supabase.rpc('portal_waitlist', { p_patient_id: me.patient_id }),
  ]);
  const up = ((future.data ?? []) as any[]);
  const old = ((past.data ?? []) as any[]).reverse();
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between"><h1 className="text-xl font-semibold">Minhas aulas</h1><Link href="/portal/agendar"><Button>Agendar / repor aula</Button></Link></div>
      <Section title="Próximas">
        {up.length === 0 ? <EmptyState title="Nenhuma aula agendada" /> : (
          <ul className="divide-y">{up.map((a) => (
            <li key={a.participant_id} className="flex flex-wrap items-center justify-between gap-2 py-3">
              <div><p className="font-medium capitalize">{dateTime(a.starts_at)}</p><p className="text-sm text-muted-foreground">{a.service} · {a.staff ?? ''}{a.room ? ` · ${a.room}` : ''}{a.is_replacement ? ' · reposição' : ''}</p></div>
              <PortalAppointmentActions a={a} />
            </li>
          ))}</ul>
        )}
        <p className="mt-3 text-xs text-muted-foreground">Para remarcar, cancele a aula (dentro do prazo para receber crédito) e agende outro horário usando a reposição.</p>
      </Section>
      {((wl.data ?? []) as any[]).length > 0 && (
        <Section title="Lista de espera">
          <ul className="divide-y">{((wl.data ?? []) as any[]).map((w) => (
            <li key={w.id} className="flex items-center justify-between py-3 text-sm">
              <span>{dateTime(w.starts_at)} · {w.service} {w.status === 'notified' && <Badge variant="warning" className="ml-1">Abriu vaga! Agende agora</Badge>}</span>
              <LeaveWaitlistButton id={w.id} />
            </li>
          ))}</ul>
        </Section>
      )}
      <Section title="Histórico (90 dias)">
        {old.length === 0 ? <p className="text-sm text-muted-foreground">Sem aulas no período.</p> : (
          <ul className="divide-y">{old.map((a) => (
            <li key={a.participant_id} className="flex items-center justify-between py-2.5 text-sm">
              <span className="capitalize">{dateTime(a.starts_at)} · {a.service}</span>
              <Badge variant={['present', 'completed'].includes(a.status) ? 'success' : a.status === 'absent' ? 'danger' : 'neutral'}>{participantStatus[a.status]}</Badge>
            </li>
          ))}</ul>
        )}
      </Section>
    </div>
  );
}

import { getAppContext } from '@/lib/auth/context';
import { Section, Table, Th, Td, Tr, EmptyState } from '@/components/ui/misc';
import { Badge, statusVariant } from '@/components/ui/badge';
import { dateTime, date, WEEKDAYS } from '@/lib/format';
import { label, participantStatus } from '@/lib/labels';
import { ParticipationActions, MemberActions, CreditActions, FixedScheduleButton } from './schedule-actions';

const CREDIT_REASON: Record<string, string> = { cancel_notice: 'Cancelamento com antecedência', absence: 'Falta', holiday: 'Feriado', staff_absence: 'Ausência do professor', clinic: 'Cancelado pela clínica', manual: 'Crédito manual' };
const CREDIT_STATUS: Record<string, string> = { available: 'Disponível', used: 'Utilizado', expired: 'Expirado', cancelled: 'Cancelado' };

export async function ScheduleTab({ patientId }: { patientId: string; searchParams?: Record<string, string> }) {
  const ctx = await getAppContext();
  const since = new Date(Date.now() - 60 * 86400000).toISOString();
  const until = new Date(Date.now() + 60 * 86400000).toISOString();
  const [parts, members, credits, services, staff, rooms] = await Promise.all([
    ctx.supabase.from('appointment_participants').select('id, status, replacement_credit_id, appointments!inner(id, starts_at, ends_at, status, services(name), staff!appointments_staff_id_fkey(full_name), rooms(name))')
      .eq('patient_id', patientId).gte('appointments.starts_at', since).lte('appointments.starts_at', until).limit(400),
    ctx.supabase.from('recurrence_members').select('id, status, starts_on, ends_on, paused_from, paused_until, recurrences(id, weekday, start_time, duration_min, name, services(name), staff(full_name))')
      .eq('patient_id', patientId).neq('status', 'ended'),
    ctx.supabase.from('replacement_credits').select('id, reason, status, expires_at, created_at, notes').eq('patient_id', patientId).order('created_at', { ascending: false }).limit(50),
    ctx.supabase.from('services').select('id, name, default_duration_min, default_capacity').eq('organization_id', ctx.org.id).eq('is_active', true).is('deleted_at', null).order('name'),
    ctx.supabase.from('staff').select('id, full_name').eq('organization_id', ctx.org.id).eq('status', 'active').eq('is_bookable', true).is('deleted_at', null).order('full_name'),
    ctx.supabase.from('rooms').select('id, name, unit_id').eq('organization_id', ctx.org.id).eq('is_active', true).is('deleted_at', null).order('name'),
  ]);
  const now = new Date().toISOString();
  const list = ((parts.data ?? []) as any[]).sort((a, b) => b.appointments.starts_at.localeCompare(a.appointments.starts_at));
  const upcoming = list.filter((p) => p.appointments.starts_at >= now).reverse();
  const past = list.filter((p) => p.appointments.starts_at < now);
  const canEdit = ctx.can('schedule.edit');

  const row = (p: any) => (
    <Tr key={p.id}>
      <Td className="whitespace-nowrap">{dateTime(p.appointments.starts_at, ctx.tz)}</Td>
      <Td>{p.appointments.services?.name}{p.replacement_credit_id && <Badge variant="info" className="ml-2">Reposição</Badge>}</Td>
      <Td className="hidden md:table-cell">{p.appointments.staff?.full_name ?? '—'}</Td>
      <Td><Badge variant={statusVariant[p.status] ?? 'neutral'}>{label(participantStatus, p.status)}</Badge></Td>
      <Td className="text-right">{canEdit && <ParticipationActions participantId={p.id} status={p.status} startsAt={p.appointments.starts_at} />}</Td>
    </Tr>
  );

  return (
    <div className="space-y-6">
      <Section title="Horários fixos" description="Aulas semanais recorrentes geradas automaticamente."
        actions={ctx.can('schedule.create') ? <FixedScheduleButton patientId={patientId} units={ctx.units} unitId={ctx.unitId} services={(services.data ?? []) as any[]} staff={(staff.data ?? []) as any[]} rooms={(rooms.data ?? []) as any[]} /> : undefined}>
        {(members.data ?? []).length === 0 ? <p className="text-sm text-muted-foreground">Nenhum horário fixo cadastrado.</p> : (
          <ul className="divide-y">
            {((members.data ?? []) as any[]).map((m) => (
              <li key={m.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                <div>
                  <p className="font-medium">{WEEKDAYS[m.recurrences.weekday]} às {String(m.recurrences.start_time).slice(0, 5)} · {m.recurrences.services?.name}</p>
                  <p className="text-sm text-muted-foreground">
                    {m.recurrences.staff?.full_name ?? 'Sem profissional'} · desde {date(m.starts_on)}
                    {m.status === 'paused' && <> · <b className="text-warning">pausado de {date(m.paused_from)} a {date(m.paused_until)}</b></>}
                  </p>
                </div>
                {canEdit && <MemberActions memberId={m.id} status={m.status} />}
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Próximas aulas">
        {upcoming.length === 0 ? <EmptyState title="Nenhuma aula futura" /> : (
          <Table><thead><tr><Th>Data</Th><Th>Modalidade</Th><Th className="hidden md:table-cell">Profissional</Th><Th>Status</Th><Th /></tr></thead><tbody>{upcoming.map(row)}</tbody></Table>
        )}
      </Section>

      <Section title="Créditos de reposição" actions={ctx.can('schedule.override') ? <CreditActions patientId={patientId} /> : undefined}>
        {(credits.data ?? []).length === 0 ? <p className="text-sm text-muted-foreground">Nenhum crédito de reposição.</p> : (
          <Table>
            <thead><tr><Th>Gerado em</Th><Th>Motivo</Th><Th>Validade</Th><Th>Status</Th></tr></thead>
            <tbody>
              {((credits.data ?? []) as any[]).map((c) => (
                <Tr key={c.id}>
                  <Td>{date(c.created_at, ctx.tz)}</Td>
                  <Td>{CREDIT_REASON[c.reason] ?? c.reason}{c.notes && <span className="block text-xs text-muted-foreground">{c.notes}</span>}</Td>
                  <Td>{c.expires_at ? date(c.expires_at, ctx.tz) : '—'}</Td>
                  <Td><Badge variant={c.status === 'available' ? 'success' : 'neutral'}>{CREDIT_STATUS[c.status]}</Badge></Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        )}
      </Section>

      <Section title="Histórico (últimos 60 dias)">
        {past.length === 0 ? <p className="text-sm text-muted-foreground">Sem aulas no período.</p> : (
          <Table><thead><tr><Th>Data</Th><Th>Modalidade</Th><Th className="hidden md:table-cell">Profissional</Th><Th>Status</Th><Th /></tr></thead><tbody>{past.map(row)}</tbody></Table>
        )}
      </Section>
    </div>
  );
}

import { notFound } from 'next/navigation';
import { requirePermission } from '@/lib/auth/context';
import { PageHeader, Section, KeyValue, StatCard } from '@/components/ui/misc';
import { Badge } from '@/components/ui/badge';
import { ResourceSection } from '@/components/resource/resource-page';
import { WorkingHoursEditor } from '@/components/app/staff/working-hours';
import { label, staffKind, staffStatus } from '@/lib/labels';
import { date, money } from '@/lib/format';

export default async function StaffDetail({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requirePermission(['staff.view', 'schedule.view']);
  const { id } = await params;
  const { data: s } = await ctx.supabase.from('staff').select('*').eq('id', id).eq('organization_id', ctx.org.id).maybeSingle();
  if (!s || s.deleted_at) notFound();
  const monthStart = new Date(); monthStart.setDate(1);
  const [{ data: hours }, { data: appts }, { data: comm }] = await Promise.all([
    ctx.supabase.from('staff_working_hours').select('weekday, start_time, end_time, break_start, break_end, unit_id').eq('staff_id', id).order('weekday'),
    ctx.supabase.from('appointments').select('id, status, starts_at, ends_at').eq('staff_id', id).neq('status', 'cancelled').gte('starts_at', monthStart.toISOString()),
    ctx.can('commissions.view') ? ctx.supabase.from('commissions').select('amount, status').eq('staff_id', id).eq('period_month', monthStart.toISOString().slice(0, 10)) : Promise.resolve({ data: [] as any[] }),
  ]);
  const sessions = (appts ?? []).length;
  const hoursSum = (appts ?? []).reduce((h: number, a: any) => h + (new Date(a.ends_at).getTime() - new Date(a.starts_at).getTime()) / 3600000, 0);
  return (
    <>
      <PageHeader title={s.full_name} description={`${label(staffKind, s.kind)}${s.professional_registry ? ` · ${s.professional_registry}` : ''}`} back={{ href: '/app/equipe', label: 'Equipe' }}
        actions={<Badge variant={s.status === 'active' ? 'success' : 'neutral'}>{label(staffStatus, s.status)}</Badge>} />
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <StatCard label="Atendimentos no mês" value={sessions} />
        <StatCard label="Horas agendadas no mês" value={hoursSum.toFixed(1).replace('.', ',')} />
        {ctx.can('commissions.view') && <StatCard label="Comissões do mês" value={money(((comm ?? []) as any[]).reduce((t, c) => t + Number(c.amount), 0))} />}
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <Section title="Dados">
          <KeyValue items={[
            { label: 'E-mail', value: s.email }, { label: 'Telefone', value: s.phone },
            { label: 'Profissão', value: s.profession }, { label: 'Especialidades', value: (s.specialties ?? []).join(', ') || null },
            { label: 'Admissão', value: s.hired_at ? date(s.hired_at) : null }, { label: 'Acesso ao sistema', value: s.user_id ? 'Sim' : 'Não (convide em Configurações → Usuários)' },
            { label: 'Agendamento online', value: s.allow_online_booking ? 'Permitido' : 'Não' }, { label: 'Exibido no site', value: s.show_on_website ? 'Sim' : 'Não' },
          ]} />
        </Section>
        <Section title="Jornada semanal" description="Agendamentos fora destes horários exigem autorização.">
          <WorkingHoursEditor staffId={id} initial={(hours ?? []) as any[]} units={ctx.units} canEdit={ctx.can('staff.edit')} />
        </Section>
      </div>
      <Section title="Férias, folgas e bloqueios" className="mt-6">
        <ResourceSection resource="staff_time_off" fixed={{ staff_id: id }} compact hideSearch />
      </Section>
    </>
  );
}

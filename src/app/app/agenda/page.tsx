import { requirePermission } from '@/lib/auth/context';
import { PageHeader, ErrorState, EmptyState } from '@/components/ui/misc';
import { Agenda } from '@/components/app/agenda/agenda';
import { rangeFor, VIEWS, type View } from '@/components/app/agenda/utils';
import { loadAgenda } from '@/lib/actions/schedule';
import { todayISO } from '@/lib/format';
import type { AgendaOptions } from '@/components/app/agenda/types';
import type { NewApptDefaults } from '@/components/app/agenda/appointment-dialog';
import Link from 'next/link';
import { Button } from '@/components/ui/button';

export const metadata = { title: 'Agenda' };

export default async function AgendaPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const ctx = await requirePermission('schedule.view');
  const sp = await searchParams;
  const date = /^\d{4}-\d{2}-\d{2}$/.test(sp.data ?? '') ? sp.data : todayISO(ctx.tz);
  const view = (VIEWS.some((v) => v.id === sp.vis) ? sp.vis : 'semana') as View;
  const unitId = ctx.unitId ?? ctx.units[0]?.id;
  if (!unitId) return <EmptyState title="Cadastre uma unidade" description="A agenda precisa de pelo menos uma unidade." action={<Link href="/app/configuracoes/unidades"><Button>Cadastrar unidade</Button></Link>} />;

  const range = rangeFor(view, date);
  const [appts, services, staff, rooms, equipment, units, holidays] = await Promise.all([
    loadAgenda(range.from, range.to, ctx.unitId),
    ctx.supabase.from('services').select('id, name, color, kind, default_duration_min, default_capacity').eq('organization_id', ctx.org.id).eq('is_active', true).is('deleted_at', null).order('name'),
    ctx.supabase.from('staff').select('id, full_name, color, unit_id').eq('organization_id', ctx.org.id).eq('status', 'active').eq('is_bookable', true).is('deleted_at', null).order('full_name'),
    ctx.supabase.from('rooms').select('id, name, color, unit_id, capacity').eq('organization_id', ctx.org.id).eq('is_active', true).is('deleted_at', null).order('name'),
    ctx.supabase.from('equipment').select('id, name, unit_id, status').eq('organization_id', ctx.org.id).neq('status', 'inactive').is('deleted_at', null).order('name'),
    ctx.supabase.from('units').select('id, name, business_hours').eq('organization_id', ctx.org.id).eq('is_active', true).is('deleted_at', null).order('created_at'),
    ctx.supabase.from('holidays').select('date, name, unit_id').eq('organization_id', ctx.org.id).gte('date', range.from).lte('date', range.to),
  ]);
  if (!appts.ok) return <ErrorState description={appts.error} />;

  const options: AgendaOptions = {
    units: (units.data ?? []) as any[],
    services: ((services.data ?? []) as any[]).map((s) => ({ id: s.id, name: s.name, color: s.color, kind: s.kind, default_duration_min: s.default_duration_min, default_capacity: s.default_capacity })),
    staff: ((staff.data ?? []) as any[]).filter((s) => !ctx.unitId || !s.unit_id || s.unit_id === ctx.unitId).map((s) => ({ id: s.id, name: s.full_name, color: s.color, unit_id: s.unit_id })),
    rooms: ((rooms.data ?? []) as any[]).map((r) => ({ id: r.id, name: r.name, color: r.color, unit_id: r.unit_id, capacity: r.capacity })),
    equipment: ((equipment.data ?? []) as any[]).map((r) => ({ id: r.id, name: r.name, unit_id: r.unit_id })),
  };

  // faixa de horas exibida: horário de funcionamento da unidade (padrão 06h–22h)
  const unit = options.units.find((u) => u.id === unitId);
  let start = 24 * 60, end = 0;
  for (const list of Object.values(unit?.business_hours ?? {})) for (const r of list ?? []) {
    const [sh, sm] = r.start.split(':').map(Number); const [eh, em] = r.end.split(':').map(Number);
    start = Math.min(start, sh * 60 + sm); end = Math.max(end, eh * 60 + em);
  }
  if (start >= end) { start = 6 * 60; end = 22 * 60; }
  start = Math.max(0, Math.floor(start / 60) * 60 - 60); end = Math.min(24 * 60, Math.ceil(end / 60) * 60 + 60);

  let openNew: NewApptDefaults | null = null;
  if (sp.novo === '1' && ctx.can('schedule.create')) {
    let patients: { id: string; name: string; credits?: number }[] = [];
    if (sp.aluno) {
      const { data: p } = await ctx.supabase.from('patients').select('id, full_name, social_name, replacement_balance').eq('id', sp.aluno).eq('organization_id', ctx.org.id).maybeSingle();
      if (p) patients = [{ id: p.id, name: p.social_name || p.full_name, credits: p.replacement_balance }];
    }
    openNew = { date, start: '08:00', patients };
  }

  return (
    <>
      <PageHeader title="Agenda" description="Clique em um horário vazio para agendar. Arraste para remarcar. Clique no agendamento para presença, cancelamento e reposição." />
      {options.services.length === 0 ? (
        <EmptyState title="Cadastre as modalidades" description="Crie ao menos uma modalidade (ex.: Pilates aparelhos) para começar a agendar." action={<Link href="/app/configuracoes/modalidades"><Button>Cadastrar modalidades</Button></Link>} />
      ) : (
        <Agenda appointments={appts.data ?? []} options={options} tz={ctx.tz} date={date} view={view} unitId={unitId}
          perms={{ create: ctx.can('schedule.create'), edit: ctx.can('schedule.edit'), override: ctx.can('schedule.override'), medical: ctx.can('medical_records.view') }}
          dayRange={{ start, end }} holidays={((holidays.data ?? []) as any[]).filter((h) => !h.unit_id || h.unit_id === unitId)}
          openNew={openNew} highlightId={sp.ag ?? null} />
      )}
    </>
  );
}

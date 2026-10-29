import { requirePermission } from '@/lib/auth/context';
import { PageHeader, StatCard } from '@/components/ui/misc';
import { LeadBoard } from '@/components/app/crm/lead-board';
import { getResourceDef } from '@/lib/resources/defs';
import { loadRefOptions } from '@/lib/resources/server';
import { percent } from '@/lib/format';

export const metadata = { title: 'CRM' };

export default async function CrmPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const ctx = await requirePermission('crm.view');
  const sp = await searchParams;
  const since = new Date(Date.now() - 180 * 86400000).toISOString();
  let q = ctx.supabase.from('leads').select('*').eq('organization_id', ctx.org.id).is('deleted_at', null).or(`stage.not.in.(enrolled,lost),updated_at.gte.${since}`);
  if (ctx.unitId) q = q.or(`unit_id.eq.${ctx.unitId},unit_id.is.null`);
  const [{ data: leads }, refOptions, services, staff, rooms, plans, templates, report] = await Promise.all([
    q.order('created_at', { ascending: false }).limit(800),
    loadRefOptions(ctx, getResourceDef('leads')),
    ctx.supabase.from('services').select('id, name, default_duration_min, kind').eq('organization_id', ctx.org.id).eq('is_active', true).is('deleted_at', null).order('name'),
    ctx.supabase.from('staff').select('id, full_name').eq('organization_id', ctx.org.id).eq('status', 'active').eq('is_bookable', true).is('deleted_at', null).order('full_name'),
    ctx.supabase.from('rooms').select('id, name, unit_id').eq('organization_id', ctx.org.id).eq('is_active', true).is('deleted_at', null),
    ctx.supabase.from('plans').select('id, name').eq('organization_id', ctx.org.id).eq('is_active', true).is('deleted_at', null).order('sort_order'),
    ctx.supabase.from('message_templates').select('id, key, channel, name, body').eq('organization_id', ctx.org.id).eq('is_active', true),
    ctx.supabase.rpc('report_marketing', { p_org: ctx.org.id, p_from: new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10), p_to: new Date().toISOString().slice(0, 10) }),
  ]);
  const m = (report.data ?? {}) as any;
  const totalConv = (m.by_origin ?? []).reduce((t: number, r: any) => t + Number(r.enrolled), 0);
  return (
    <>
      <PageHeader title="CRM e leads" description="Funil de captação: arraste os cartões entre as etapas. Experimentais, follow-ups e conversão." />
      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Leads (90 dias)" value={m.leads ?? 0} />
        <StatCard label="Matrículas (90 dias)" value={totalConv} tone="success" />
        <StatCard label="Conversão de experimentais" value={percent(m.trials?.conversion_rate)} hint={`${m.trials?.attended ?? 0} experimentais realizadas`} />
        <StatCard label="Custo por aquisição" value={m.cost_per_acquisition ? `R$ ${String(m.cost_per_acquisition).replace('.', ',')}` : '—'} hint="Quando há custo informado nos leads" />
      </div>
      <LeadBoard leads={(leads ?? []) as any[]} refOptions={refOptions} tz={ctx.tz} openLeadId={sp.lead ?? null}
        units={ctx.units} unitId={ctx.unitId ?? ctx.units[0]?.id ?? ''} services={(services.data ?? []) as any[]} staff={(staff.data ?? []) as any[]} rooms={(rooms.data ?? []) as any[]} plans={(plans.data ?? []) as any[]}
        templates={(templates.data ?? []) as any[]}
        can={{ create: ctx.can('crm.create'), edit: ctx.can('crm.edit'), delete: ctx.can('crm.delete'), schedule: ctx.can('schedule.create'), convert: ctx.can('patients.create'), message: ctx.can('communication.create') }} />
    </>
  );
}

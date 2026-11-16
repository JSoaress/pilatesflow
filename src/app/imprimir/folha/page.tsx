import { notFound } from 'next/navigation';
import { requirePermission } from '@/lib/auth/context';
import { loadPrintOrg } from '@/lib/print';
import { HandoutEditor } from '@/components/print/handout-editor';
import { date, dateTime } from '@/lib/format';

export const metadata = { title: 'Folha para o aluno' };

export default async function HandoutPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const ctx = await requirePermission(['documents.view', 'patients.view']);
  const sp = await searchParams;
  if (!sp.aluno) notFound();
  const { data: p } = await ctx.supabase.from('patients').select('id, full_name, social_name, cpf, rg, birth_date, unit_id').eq('id', sp.aluno).eq('organization_id', ctx.org.id).maybeSingle();
  if (!p) notFound();
  const now = new Date().toISOString();
  const [org, { data: templates }, { data: unit }, { data: next }, { data: sub }] = await Promise.all([
    loadPrintOrg(ctx, p.unit_id),
    ctx.supabase.from('document_templates').select('id, type, name, body').eq('organization_id', ctx.org.id).eq('is_active', true).in('type', ['handout', 'other', 'certificate', 'consent_term', 'image_authorization']).order('type').order('name'),
    ctx.supabase.from('units').select('name, address_street, address_number, address_city').eq('id', p.unit_id ?? ctx.units[0]?.id ?? '00000000-0000-0000-0000-000000000000').maybeSingle(),
    ctx.can('schedule.view') ? ctx.supabase.from('appointment_participants').select('status, appointment:appointments!inner(starts_at, status, service:services(name), staff!appointments_staff_id_fkey(full_name))').eq('patient_id', p.id).in('status', ['scheduled', 'confirmed', 'replacement']).gte('appointment.starts_at', now).limit(30) : Promise.resolve({ data: [] }),
    ctx.can('plans.view') ? ctx.supabase.from('subscriptions').select('end_date, sessions_total, sessions_used, sessions_extra, plan:plans(name)').eq('patient_id', p.id).eq('status', 'active').maybeSingle() : Promise.resolve({ data: null }),
  ]);
  const vars: Record<string, string> = {
    nome_aluno: p.social_name || p.full_name, cpf: p.cpf ?? 'não informado', rg: p.rg ?? '', data_nascimento: p.birth_date ? date(p.birth_date) : '',
    unidade: unit?.name ?? '', empresa: org.legal_name || org.name, cnpj_empresa: org.cnpj ?? '',
    endereco_unidade: [unit?.address_street, unit?.address_number, unit?.address_city].filter(Boolean).join(', '),
    data_hoje: new Intl.DateTimeFormat('pt-BR', { timeZone: ctx.tz }).format(new Date()),
  };
  const upcoming = ((next ?? []) as any[]).filter((x) => x.appointment?.status === 'scheduled').sort((a, b) => a.appointment.starts_at.localeCompare(b.appointment.starts_at)).slice(0, 12).map((x) => `${dateTime(x.appointment.starts_at, ctx.tz)} — ${x.appointment.service?.name ?? 'Aula'}${x.appointment.staff?.full_name ? ` (${x.appointment.staff.full_name})` : ''}`);
  const s = sub as any;
  const planLine = s ? `${s.plan?.name ?? 'Plano'}${s.end_date ? ` · válido até ${date(s.end_date)}` : ''}${s.sessions_total ? ` · ${s.sessions_total + s.sessions_extra - s.sessions_used} aulas restantes` : ''}` : null;
  return (
    <HandoutEditor org={org} patient={{ id: p.id, name: p.social_name || p.full_name }} templates={(templates ?? []) as any[]} vars={vars}
      initialTemplate={sp.modelo ?? null} upcoming={upcoming} planLine={planLine} canSave={ctx.can('documents.create')} />
  );
}

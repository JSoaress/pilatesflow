import { requirePermission } from '@/lib/auth/context';
import { PageHeader } from '@/components/ui/misc';
import { AssessmentForm } from '@/components/app/clinical/assessment-form';

export const metadata = { title: 'Nova avaliação' };

export default async function NewAssessment({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const ctx = await requirePermission('assessments.create');
  const sp = await searchParams;
  const [{ data: fields }, { data: staff }, patient] = await Promise.all([
    ctx.supabase.from('assessment_fields').select('key, label, unit, section, input_type').eq('organization_id', ctx.org.id).eq('is_active', true).order('sort_order'),
    ctx.supabase.from('staff').select('id, full_name').eq('organization_id', ctx.org.id).eq('status', 'active').in('kind', ['physiotherapist', 'pe_professional', 'instructor']).is('deleted_at', null).order('full_name'),
    sp.aluno ? ctx.supabase.from('patients').select('id, full_name, social_name').eq('id', sp.aluno).eq('organization_id', ctx.org.id).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  const p = patient.data as any;
  return (
    <>
      <PageHeader title="Nova avaliação" back={sp.aluno ? { href: `/app/alunos/${sp.aluno}?aba=avaliacoes`, label: 'Aluno' } : { href: '/app/avaliacoes', label: 'Avaliações' }} />
      <div className="rounded-xl border bg-card p-6 shadow-soft">
        <AssessmentForm fields={(fields ?? []) as any[]} staff={((staff ?? []) as any[]).map((s) => ({ id: s.id, name: s.full_name }))} patient={p ? { id: p.id, name: p.social_name || p.full_name } : null} />
      </div>
    </>
  );
}

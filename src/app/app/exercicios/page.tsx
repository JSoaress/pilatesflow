import { requirePermission } from '@/lib/auth/context';
import { PageHeader, EmptyState } from '@/components/ui/misc';
import { TabLinks } from '@/components/ui/tab-links';
import { ResourceSection } from '@/components/resource/resource-page';
import { ProgramEditor, NewProgramButton } from '@/components/app/clinical/program-editor';

export const metadata = { title: 'Exercícios' };

export default async function ExercisesPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const ctx = await requirePermission('exercises.view');
  const sp = await searchParams;
  const tab = ['modelos', 'categorias'].includes(sp.aba) ? sp.aba : 'biblioteca';
  let templates: any[] = [];
  let exercises: any[] = [];
  if (tab === 'modelos') {
    const [t, e] = await Promise.all([
      ctx.supabase.from('patient_programs').select('id, name, goal, status, items:patient_program_exercises(id, sort_order, sets, repetitions, duration_seconds, load, springs, notes, progression, exercise:exercises(id, name))')
        .eq('organization_id', ctx.org.id).eq('is_template', true).eq('status', 'active').order('name'),
      ctx.supabase.from('exercises').select('id, name, springs_config, repetitions').eq('organization_id', ctx.org.id).eq('is_active', true).is('deleted_at', null).order('name'),
    ]);
    templates = t.data ?? []; exercises = e.data ?? [];
  }
  const canEdit = ctx.can('exercises.create') || ctx.can('exercises.edit');
  return (
    <>
      <PageHeader title="Exercícios" description="Biblioteca de exercícios de Pilates e modelos de programa reutilizáveis." />
      <TabLinks base="/app/exercicios" active={tab} tabs={[{ id: 'biblioteca', label: 'Biblioteca' }, { id: 'modelos', label: 'Modelos de programa' }, { id: 'categorias', label: 'Categorias' }]} />
      {tab === 'biblioteca' && <ResourceSection resource="exercises" searchParams={sp} />}
      {tab === 'categorias' && <ResourceSection resource="exercise_categories" searchParams={sp} />}
      {tab === 'modelos' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">Ex.: Pilates lombar, gestante, idoso iniciante, joelho, ombro, core. Modelos são apoio profissional e não geram diagnóstico.</p>
            {canEdit && <NewProgramButton isTemplate />}
          </div>
          {templates.length === 0 ? <EmptyState title="Nenhum modelo" /> : templates.map((t) => (
            <section key={t.id} className="rounded-xl border bg-card p-4 shadow-soft">
              <p className="font-medium">{t.name}</p>
              {t.goal && <p className="mb-3 text-sm text-muted-foreground">{t.goal}</p>}
              <ProgramEditor programId={t.id} status={t.status} items={((t.items ?? []) as any[]).sort((x, y) => x.sort_order - y.sort_order)} exercises={exercises} canEdit={canEdit} />
            </section>
          ))}
        </div>
      )}
    </>
  );
}

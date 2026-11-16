import { Printer } from 'lucide-react';
import { getAppContext } from '@/lib/auth/context';
import { Section, EmptyState } from '@/components/ui/misc';
import { Badge } from '@/components/ui/badge';
import { date } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { ProgramEditor, NewProgramButton } from '@/components/app/clinical/program-editor';

export async function ProgramsTab({ patientId }: { patientId: string }) {
  const ctx = await getAppContext();
  const [programs, templates, exercises] = await Promise.all([
    ctx.supabase.from('patient_programs').select('id, name, goal, start_date, status, notes, staff(full_name), items:patient_program_exercises(id, sort_order, sets, repetitions, duration_seconds, load, springs, notes, progression, exercise:exercises(id, name, level, springs_config))')
      .eq('patient_id', patientId).order('created_at', { ascending: false }),
    ctx.supabase.from('patient_programs').select('id, name').eq('organization_id', ctx.org.id).eq('is_template', true).eq('status', 'active').order('name'),
    ctx.supabase.from('exercises').select('id, name, springs_config, repetitions').eq('organization_id', ctx.org.id).eq('is_active', true).is('deleted_at', null).order('name'),
  ]);
  const canEdit = ctx.can('exercises.create') || ctx.can('exercises.edit');
  const list = (programs.data ?? []) as any[];
  return (
    <div className="space-y-6">
      <Section title="Plano de exercícios" description="Sequência individual de exercícios, séries, molas e progressão."
        actions={canEdit ? <NewProgramButton patientId={patientId} templates={(templates.data ?? []) as any[]} /> : undefined}>
        {list.length === 0 ? <EmptyState title="Nenhum programa" description="Crie um programa do zero ou a partir de um modelo (ex.: Pilates lombar)." /> : (
          <div className="space-y-6">
            {list.map((p) => (
              <div key={p.id} className="rounded-xl border p-4">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="font-medium">{p.name} {p.status === 'archived' && <Badge variant="neutral">Arquivado</Badge>}</p>
                    <p className="text-sm text-muted-foreground">{p.goal ?? ''}{p.start_date && ` · desde ${date(p.start_date)}`}{p.staff?.full_name && ` · ${p.staff.full_name}`}</p>
                  </div>
                  <a href={`/imprimir/programa/${p.id}`} target="_blank" rel="noopener"><Button size="sm" variant="outline"><Printer /> Imprimir para o aluno</Button></a>
                </div>
                <ProgramEditor programId={p.id} status={p.status} items={((p.items ?? []) as any[]).sort((a, b) => a.sort_order - b.sort_order)} exercises={(exercises.data ?? []) as any[]} canEdit={canEdit && p.status === 'active'} />
              </div>
            ))}
          </div>
        )}
        <p className="mt-4 text-xs text-muted-foreground">Modelos são ferramentas de apoio profissional e não geram diagnóstico. Ajuste sempre conforme a avaliação individual.</p>
      </Section>
    </div>
  );
}

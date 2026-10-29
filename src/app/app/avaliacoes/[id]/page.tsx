import Link from 'next/link';
import { notFound } from 'next/navigation';
import { GitCompare } from 'lucide-react';
import { requirePermission } from '@/lib/auth/context';
import { PageHeader, Section, KeyValue } from '@/components/ui/misc';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { AssessmentForm } from '@/components/app/clinical/assessment-form';
import { PosturalPhotos } from '@/components/app/clinical/postural-photos';
import { signedUrls } from '@/lib/storage';
import { date, dateTime, number } from '@/lib/format';
import { label, assessmentType } from '@/lib/labels';

export default async function AssessmentPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requirePermission('assessments.view');
  const { id } = await params;
  const { data: a } = await ctx.supabase.from('assessments').select('*, patients(id, full_name, social_name), staff(full_name)').eq('id', id).eq('organization_id', ctx.org.id).maybeSingle();
  if (!a) notFound();
  const [{ data: fields }, { data: photos }, { data: staff }] = await Promise.all([
    ctx.supabase.from('assessment_fields').select('key, label, unit, section, input_type').eq('organization_id', ctx.org.id).order('sort_order'),
    ctx.supabase.from('postural_photos').select('id, view, storage_path, annotations, taken_at').eq('assessment_id', id).order('taken_at'),
    ctx.supabase.from('staff').select('id, full_name').eq('organization_id', ctx.org.id).eq('status', 'active').is('deleted_at', null).order('full_name'),
  ]);
  const urls = await signedUrls(ctx, 'clinical', ((photos ?? []) as any[]).map((p) => p.storage_path), 900);
  const patient = a.patients as any;
  const editable = a.status === 'draft' && ctx.can('assessments.edit');
  return (
    <>
      <PageHeader title={`Avaliação — ${patient?.social_name || patient?.full_name}`} description={`${label(assessmentType, a.type)} · ${date(a.assessed_on)}${a.staff ? ` · ${(a.staff as any).full_name}` : ''}`}
        back={{ href: `/app/alunos/${patient?.id}?aba=avaliacoes`, label: 'Ficha do aluno' }}
        actions={<>
          <Badge variant={a.status === 'finalized' ? 'success' : 'warning'}>{a.status === 'finalized' ? `Finalizada em ${dateTime(a.finalized_at, ctx.tz)}` : 'Rascunho'}</Badge>
          <Link href={`/app/avaliacoes/comparar?aluno=${patient?.id}&b=${id}`}><Button variant="outline"><GitCompare /> Comparar</Button></Link>
        </>} />
      <div className="space-y-6">
        {editable ? (
          <div className="rounded-xl border bg-card p-6 shadow-soft">
            <AssessmentForm assessment={a} fields={(fields ?? []) as any[]} patient={{ id: patient.id, name: patient.social_name || patient.full_name }} staff={((staff ?? []) as any[]).map((s) => ({ id: s.id, name: s.full_name }))} />
          </div>
        ) : (
          <Section title="Resultados">
            <KeyValue cols={3} items={[
              { label: 'Altura', value: a.height_cm ? `${number(a.height_cm, 1)} cm` : null },
              { label: 'Peso', value: a.weight_kg ? `${number(a.weight_kg, 1)} kg` : null },
              { label: 'IMC', value: a.bmi ? number(a.bmi, 1) : null },
              { label: 'Dor (0–10)', value: a.pain_scale },
              { label: 'Borg (6–20)', value: a.borg_scale },
              { label: 'Próxima reavaliação', value: a.next_assessment_on ? date(a.next_assessment_on) : null },
              ...((fields ?? []) as any[]).filter((f) => a.data?.[f.key] !== undefined).map((f) => ({ label: `${f.label}${f.unit ? ` (${f.unit})` : ''}`, value: String(a.data[f.key]).replace('.', ',') })),
            ]} />
            {(a.postural_findings || a.notes || a.conclusion) && (
              <div className="mt-6 grid gap-4 sm:grid-cols-3 text-sm">
                {a.postural_findings && <div><p className="text-xs text-muted-foreground">Achados posturais</p><p className="whitespace-pre-wrap">{a.postural_findings}</p></div>}
                {a.notes && <div><p className="text-xs text-muted-foreground">Observações</p><p className="whitespace-pre-wrap">{a.notes}</p></div>}
                {a.conclusion && <div><p className="text-xs text-muted-foreground">Conclusão</p><p className="whitespace-pre-wrap">{a.conclusion}</p></div>}
              </div>
            )}
          </Section>
        )}
        <Section title="Avaliação postural — fotos" description="Armazenamento privado. Links temporários de 15 minutos.">
          <PosturalPhotos assessmentId={id} patientId={patient.id} photos={((photos ?? []) as any[]).map((p) => ({ ...p, url: urls[p.storage_path] ?? null }))} canUpload={ctx.can('assessments.create')} canAnnotate={ctx.can('assessments.edit')} />
        </Section>
      </div>
    </>
  );
}

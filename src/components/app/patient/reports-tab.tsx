import Link from 'next/link';
import { FileText, ImageIcon, ClipboardList, Printer, FolderOpen } from 'lucide-react';
import { getAppContext } from '@/lib/auth/context';
import { Section, EmptyState } from '@/components/ui/misc';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { date } from '@/lib/format';
import { cn } from '@/lib/utils';
import { EXAM_AREAS, EXAM_REPORT_COLUMNS, examKindLabel, areaForForm, type ExamReport } from '@/lib/exam-reports';
import { UploadReportButton, ReportActions } from '@/components/app/exam-reports/report-dialog';

const ASM_TYPE: Record<string, string> = { physical: 'Avaliação física', postural: 'Avaliação postural', functional: 'Avaliação funcional', reassessment: 'Reavaliação', clinical_form: 'Ficha clínica' };

export function ReportCard({ r, patientId, canEdit, canArchive, assessments, asmLabel }:
  { r: ExamReport; patientId: string; canEdit: boolean; canArchive: boolean; assessments: { id: string; label: string }[]; asmLabel?: string }) {
  const isPdf = r.mime_type === 'application/pdf';
  return (
    <li className="flex flex-col gap-3 rounded-xl border bg-card p-4 sm:flex-row sm:items-start">
      <div className={cn('flex size-10 shrink-0 items-center justify-center rounded-lg', isPdf ? 'bg-red-50 text-red-600 dark:bg-red-950/40' : 'bg-sky-50 text-sky-600 dark:bg-sky-950/40')}>
        {isPdf ? <FileText className="size-5" /> : <ImageIcon className="size-5" />}
      </div>
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="font-medium">{r.title}</p>
          <Badge variant="neutral">{examKindLabel(r.exam_kind)}</Badge>
          {r.category === 'medical_report' && <Badge variant="info">laudo médico</Badge>}
        </div>
        <p className="text-xs text-muted-foreground">
          {r.exam_date ? `Exame de ${date(r.exam_date)}` : 'Data do exame não informada'}
          {r.issuer ? ` · ${r.issuer}` : ''}
          {r.profiles?.full_name ? ` · enviado por ${r.profiles.full_name}` : ''}
        </p>
        {r.findings && <p className="whitespace-pre-line rounded-lg bg-muted/50 px-3 py-2 text-sm">{r.findings}</p>}
        {r.assessment_id && asmLabel && (
          <Link href={`/app/avaliacoes/${r.assessment_id}`} className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline">
            <ClipboardList className="size-3.5" /> {asmLabel}
          </Link>
        )}
      </div>
      <ReportActions report={r} patientId={patientId} canEdit={canEdit} canArchive={canArchive} assessments={assessments} />
    </li>
  );
}

export async function ReportsTab({ patientId, area }: { patientId: string; area?: string }) {
  const ctx = await getAppContext();
  const [{ data: rows }, { data: asms }] = await Promise.all([
    ctx.supabase.from('attachments').select(EXAM_REPORT_COLUMNS)
      .eq('patient_id', patientId).in('category', ['exam', 'medical_report']).is('deleted_at', null)
      .order('exam_date', { ascending: false, nullsFirst: false }).order('created_at', { ascending: false }),
    ctx.can('assessments.view')
      ? ctx.supabase.from('assessments').select('id, type, form_key, form_name, assessed_on').eq('patient_id', patientId).order('assessed_on', { ascending: false }).limit(50)
      : Promise.resolve({ data: [] as any[] }),
  ]);
  const reports = (rows ?? []) as unknown as ExamReport[];
  const asmList = ((asms ?? []) as any[]).map((a) => ({ id: a.id as string, label: `${a.form_name ?? ASM_TYPE[a.type] ?? 'Avaliação'} — ${date(a.assessed_on)}`, area: areaForForm(a.form_key) }));
  const asmOpts = asmList.map(({ id, label }) => ({ id, label }));
  const asmLabel = new Map(asmList.map((a) => [a.id, a.label]));
  const canCreate = ctx.can('medical_records.create') || ctx.can('assessments.create');
  const canEdit = ctx.can('medical_records.edit') || ctx.can('assessments.edit');
  const canArchive = ctx.can('documents.delete') || ctx.can('medical_records.edit');

  const counts = new Map<string, number>();
  for (const r of reports) counts.set(r.exam_area ?? 'geral', (counts.get(r.exam_area ?? 'geral') ?? 0) + 1);
  // áreas que o paciente tem ficha preenchida aparecem mesmo sem laudo, para lembrar de pedir o exame
  const formAreas = new Set(asmList.map((a) => a.area).filter(Boolean) as string[]);
  const activeArea = EXAM_AREAS.some((a) => a.key === area) ? area : undefined;
  const visibleAreas = EXAM_AREAS.filter((a) => (activeArea ? a.key === activeArea : counts.has(a.key) || formAreas.has(a.key)));
  const base = `/app/alunos/${patientId}?aba=laudos`;

  return (
    <div className="space-y-6">
      <Section
        title="Laudos e exames"
        description="Organizados pela mesma área das fichas de avaliação. Arquivos em armazenamento privado — cada abertura fica registrada na auditoria."
        actions={
          <div className="flex flex-wrap gap-2">
            {reports.length > 0 && <a href={`/imprimir/laudos/${patientId}${activeArea ? `?area=${activeArea}` : ''}`} target="_blank" rel="noopener noreferrer"><Button size="sm" variant="outline"><Printer /> Imprimir lista</Button></a>}
            {canCreate && <UploadReportButton patientId={patientId} defaultArea={activeArea ?? 'geral'} assessments={asmOpts} />}
          </div>
        }>
        <nav aria-label="Filtrar por área" className="flex flex-wrap gap-1.5">
          <Link href={base} scroll={false} className={cn('rounded-full border px-3 py-1 text-sm', !activeArea ? 'border-primary bg-primary text-primary-foreground' : 'hover:bg-muted')}>
            Todas <span className="ml-1 opacity-70">{reports.length}</span>
          </Link>
          {EXAM_AREAS.map((a) => {
            const n = counts.get(a.key) ?? 0;
            return (
              <Link key={a.key} href={`${base}&esp=${a.key}`} scroll={false}
                className={cn('rounded-full border px-3 py-1 text-sm', activeArea === a.key ? 'border-primary bg-primary text-primary-foreground' : n ? 'hover:bg-muted' : 'text-muted-foreground hover:bg-muted')}>
                {a.label} {n > 0 && <span className="ml-1 opacity-70">{n}</span>}
              </Link>
            );
          })}
        </nav>
      </Section>

      {visibleAreas.length === 0 ? (
        <EmptyState icon={FolderOpen} title="Nenhum laudo enviado"
          description="Envie raio-X, ressonância, exames de sangue, laudos e liberações médicas. Eles ficam separados por área: Fibromialgia, Postural, Gerontologia, Obstetrícia…"
          action={canCreate ? <UploadReportButton patientId={patientId} assessments={asmOpts} size="default" /> : undefined} />
      ) : visibleAreas.map((a) => {
        const list = reports.filter((r) => (r.exam_area ?? 'geral') === a.key);
        return (
          <Section key={a.key} title={<span className="flex items-center gap-2">{a.label} <Badge variant="neutral">{list.length}</Badge></span>} description={a.hint || undefined}
            actions={canCreate ? <UploadReportButton patientId={patientId} defaultArea={a.key} assessments={asmOpts} label={`Enviar laudo — ${a.label}`} /> : undefined}>
            {list.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {formAreas.has(a.key) ? 'O paciente tem ficha desta área, mas nenhum laudo foi enviado ainda.' : 'Nenhum laudo nesta área.'}
              </p>
            ) : (
              <ul className="space-y-2">
                {list.map((r) => <ReportCard key={r.id} r={r} patientId={patientId} canEdit={canEdit} canArchive={canArchive} assessments={asmOpts} asmLabel={r.assessment_id ? asmLabel.get(r.assessment_id) : undefined} />)}
              </ul>
            )}
          </Section>
        );
      })}
    </div>
  );
}

/** Laudos ligados a uma avaliação/ficha: os vinculados a ela e os da mesma área. */
export async function RelatedReports({ patientId, assessmentId, formKey }: { patientId: string; assessmentId: string; formKey?: string | null }) {
  const ctx = await getAppContext();
  if (!(ctx.can('medical_records.view') || ctx.can('assessments.view'))) return null;
  const area = areaForForm(formKey);
  let q = ctx.supabase.from('attachments').select(EXAM_REPORT_COLUMNS).eq('patient_id', patientId)
    .in('category', ['exam', 'medical_report']).is('deleted_at', null);
  q = area ? q.or(`assessment_id.eq.${assessmentId},exam_area.eq.${area}`) : q.eq('assessment_id', assessmentId);
  const { data } = await q.order('exam_date', { ascending: false, nullsFirst: false }).limit(30);
  const reports = (data ?? []) as unknown as ExamReport[];
  const areaLabel = EXAM_AREAS.find((a) => a.key === area)?.label;
  const canCreate = ctx.can('medical_records.create') || ctx.can('assessments.create');
  const canEdit = ctx.can('medical_records.edit') || ctx.can('assessments.edit');
  const canArchive = ctx.can('documents.delete') || ctx.can('medical_records.edit');
  const self = [{ id: assessmentId, label: 'Esta avaliação' }];
  return (
    <Section title={areaLabel ? `Laudos e exames — ${areaLabel}` : 'Laudos e exames vinculados'}
      description="Exames que embasam esta avaliação. Todos os laudos do paciente ficam na aba “Laudos e exames”."
      actions={<div className="flex flex-wrap gap-2">
        <Link href={`/app/alunos/${patientId}?aba=laudos${area ? `&esp=${area}` : ''}`}><Button size="sm" variant="ghost"><FolderOpen /> Ver todos</Button></Link>
        {canCreate && <UploadReportButton patientId={patientId} defaultArea={area ?? 'geral'} assessments={self} />}
      </div>}>
      {reports.length === 0 ? <p className="text-sm text-muted-foreground">Nenhum laudo {areaLabel ? `de ${areaLabel}` : 'vinculado'} ainda.</p> : (
        <ul className="space-y-2">
          {reports.map((r) => <ReportCard key={r.id} r={r} patientId={patientId} canEdit={canEdit} canArchive={canArchive} assessments={self} asmLabel={r.assessment_id === assessmentId ? 'Vinculado a esta avaliação' : r.assessment_id ? 'Vinculado a outra avaliação' : undefined} />)}
        </ul>
      )}
    </Section>
  );
}

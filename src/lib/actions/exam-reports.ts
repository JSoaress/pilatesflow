'use server';
import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { runAction, must, UserError } from './safe-action';
import { ALLOWED_UPLOADS, safeFileName } from '@/lib/storage';
import { EXAM_AREA_KEYS, EXAM_KIND_KEYS, examKindLabel } from '@/lib/exam-reports';

const MAX_FILE = 20 * 1024 * 1024;
const MAX_TOTAL = 25 * 1024 * 1024;
const opt = (max: number) => z.preprocess((v) => (v === '' || v === undefined || v === null ? null : String(v).trim() || null), z.string().max(max).nullable());

const meta = z.object({
  exam_area: z.enum(EXAM_AREA_KEYS, { message: 'Escolha a área do laudo.' }),
  exam_kind: z.enum(EXAM_KIND_KEYS, { message: 'Escolha o tipo de exame.' }),
  category: z.enum(['exam', 'medical_report']).default('exam'),
  exam_date: z.preprocess((v) => (v ? v : null), z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data inválida.').nullable()),
  title: opt(160),
  issuer: opt(200),
  findings: opt(8000),
  assessment_id: z.preprocess((v) => (v ? v : null), z.string().uuid().nullable()),
});

function checkDate(d: string | null) {
  if (d && d > new Date(Date.now() + 86400000).toISOString().slice(0, 10)) throw new UserError('A data do exame não pode estar no futuro.');
}

/** Envia um ou mais arquivos de laudo/exame (mesmos dados para todos). */
export async function uploadExamReport(patientId: string, fd: FormData) {
  const input = Object.fromEntries(['exam_area', 'exam_kind', 'category', 'exam_date', 'title', 'issuer', 'findings', 'assessment_id'].map((k) => [k, fd.get(k)]));
  return runAction({ permission: ['medical_records.create', 'assessments.create'], schema: meta, input }, async (ctx, d) => {
    if (!z.string().uuid().safeParse(patientId).success) throw new UserError('Paciente inválido.');
    checkDate(d.exam_date);
    const files = fd.getAll('file').filter((f): f is File => f instanceof File && f.size > 0);
    if (!files.length) throw new UserError('Selecione ao menos um arquivo.');
    if (files.length > 10) throw new UserError('Envie no máximo 10 arquivos por vez.');
    let total = 0;
    for (const f of files) {
      if (f.size > MAX_FILE) throw new UserError(`"${f.name}" passa de 20 MB.`);
      if (!ALLOWED_UPLOADS.clinical.includes(f.type)) throw new UserError(`"${f.name}": formato não permitido. Envie PDF, JPG ou PNG.`);
      total += f.size;
    }
    if (total > MAX_TOTAL) throw new UserError('Os arquivos somam mais de 25 MB. Envie em partes.');
    const { data: p } = await ctx.supabase.from('patients').select('id').eq('id', patientId).eq('organization_id', ctx.org.id).maybeSingle();
    if (!p) throw new UserError('Paciente não encontrado.');

    const baseTitle = d.title || `${examKindLabel(d.exam_kind)}${d.exam_date ? ` — ${d.exam_date.split('-').reverse().join('/')}` : ''}`;
    const uploaded: string[] = [];
    const insertedIds: string[] = [];
    try {
      for (const [i, f] of files.entries()) {
        const path = `${ctx.org.id}/patients/${patientId}/laudos/${d.exam_area}/${safeFileName(f.name)}`;
        must(await ctx.supabase.storage.from('clinical').upload(path, f, { contentType: f.type }));
        uploaded.push(path);
        const ins = must(await ctx.supabase.from('attachments').insert({
          organization_id: ctx.org.id, unit_id: ctx.unitId, patient_id: patientId, category: d.category, is_clinical: true,
          title: files.length > 1 ? `${baseTitle} (${i + 1}/${files.length})` : baseTitle,
          description: files.length > 1 ? f.name : null,
          bucket: 'clinical', storage_path: path, mime_type: f.type, size_bytes: f.size,
          exam_area: d.exam_area, exam_kind: d.exam_kind, exam_date: d.exam_date, issuer: d.issuer, findings: d.findings, assessment_id: d.assessment_id,
        }).select('id').single()) as { id: string };
        insertedIds.push(ins.id);
      }
    } catch (e) {
      // operação tudo-ou-nada: desfaz as linhas já inseridas e remove os arquivos enviados nesta chamada
      try {
        if (insertedIds.length) await ctx.supabase.from('attachments').delete().in('id', insertedIds).eq('organization_id', ctx.org.id);
        if (uploaded.length) await ctx.supabase.storage.from('clinical').remove(uploaded);
      } catch { /* rollback best-effort */ }
      throw e;
    }
    revalidatePath(`/app/alunos/${patientId}`);
    return { count: files.length };
  });
}

/** Corrige os dados de um laudo (o arquivo não muda). */
export async function updateExamReport(id: string, patientId: string, input: unknown) {
  return runAction({ permission: ['medical_records.edit', 'assessments.edit'], schema: meta, input }, async (ctx, d) => {
    checkDate(d.exam_date);
    const row = { exam_area: d.exam_area, exam_kind: d.exam_kind, category: d.category, exam_date: d.exam_date, issuer: d.issuer, findings: d.findings, assessment_id: d.assessment_id, ...(d.title ? { title: d.title } : {}) };
    must(await ctx.supabase.from('attachments').update(row).eq('id', id).eq('organization_id', ctx.org.id).eq('is_clinical', true).is('deleted_at', null));
    revalidatePath(`/app/alunos/${patientId}`);
  });
}

export async function archiveExamReport(id: string, patientId: string) {
  return runAction({ permission: ['documents.delete', 'medical_records.edit'] }, async (ctx) => {
    must(await ctx.supabase.from('attachments').update({ deleted_at: new Date().toISOString(), deleted_by: ctx.user.id }).eq('id', id).eq('organization_id', ctx.org.id).eq('is_clinical', true));
    revalidatePath(`/app/alunos/${patientId}`);
  });
}

'use server';
import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { runAction, must, UserError } from './safe-action';
import { ALLOWED_UPLOADS, safeFileName } from '@/lib/storage';
import { env } from '@/lib/env';
import { localToISO } from '@/lib/format';

const t = (max = 10000) => z.preprocess((v) => (v === '' || v === undefined ? null : v), z.string().max(max).nullable());

const MR_FIELDS = ['chief_complaint', 'current_history', 'condition_history', 'personal_history', 'family_history', 'surgeries', 'injuries',
  'diseases', 'medications', 'allergies', 'habits', 'physical_activity', 'goals', 'limitations', 'contraindications', 'pain_description',
  'clinical_notes', 'clinical_history', 'physical_exam', 'complementary_exams', 'physio_diagnosis', 'physio_prognosis', 'therapeutic_goals',
  'conduct', 'treatment_plan'] as const;
const mrSchema = z.object(Object.fromEntries(MR_FIELDS.map((f) => [f, t()])) as Record<(typeof MR_FIELDS)[number], ReturnType<typeof t>>)
  .extend({ responsible_staff_id: z.preprocess((v) => (v === '' ? null : v), z.string().uuid().nullable().optional()) });

/** Salva o prontuário (cada alteração gera versão no histórico + auditoria). */
export async function saveMedicalRecord(patientId: string, input: unknown) {
  return runAction({ permission: ['medical_records.create', 'medical_records.edit'], schema: mrSchema, input }, async (ctx, d) => {
    const { data: existing } = await ctx.supabase.from('medical_records').select('id').eq('patient_id', patientId).maybeSingle();
    if (existing) {
      if (!ctx.can('medical_records.edit')) throw new UserError('Você não tem permissão para alterar o prontuário.');
      must(await ctx.supabase.from('medical_records').update(d).eq('id', existing.id));
    } else {
      must(await ctx.supabase.from('medical_records').insert({ ...d, organization_id: ctx.org.id, patient_id: patientId, responsible_staff_id: d.responsible_staff_id ?? ctx.staffId }));
    }
    revalidatePath(`/app/alunos/${patientId}`);
  });
}

const evoSchema = z.object({
  patient_id: z.string().uuid(),
  appointment_id: z.preprocess((v) => (v === '' ? null : v), z.string().uuid().nullable().optional()),
  occurred_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  occurred_time: z.string().regex(/^\d{2}:\d{2}$/),
  complaints: t(), patient_state: t(), treatment_response: t(), incidents: t(), guidance: t(), next_conduct: t(), notes: t(),
  pain_before: z.preprocess((v) => (v === '' || v === null || v === undefined ? null : Number(v)), z.number().int().min(0).max(10).nullable()),
  pain_after: z.preprocess((v) => (v === '' || v === null || v === undefined ? null : Number(v)), z.number().int().min(0).max(10).nullable()),
  exercises: z.array(z.object({ exercise_id: z.string().uuid().nullable().optional(), name: z.string().min(1).max(120), load: z.string().max(60).optional().nullable(), springs: z.string().max(60).optional().nullable(), sets: z.string().max(10).optional().nullable(), reps: z.string().max(30).optional().nullable(), time: z.string().max(30).optional().nullable(), notes: z.string().max(300).optional().nullable() })).max(60).default([]),
  finalize: z.boolean().default(false),
});

/** Cria/edita evolução (rascunho). Com finalize=true registra autor/data/hora e torna imutável. */
export async function saveEvolution(id: string | null, input: z.input<typeof evoSchema>) {
  return runAction({ permission: 'medical_records.create', schema: evoSchema, input }, async (ctx, d) => {
    const { finalize, occurred_date, occurred_time, ...rest } = d;
    const row = { ...rest, occurred_at: localToISO(occurred_date, occurred_time, ctx.tz) };
    let evoId = id;
    if (id) must(await ctx.supabase.from('clinical_evolutions').update(row).eq('id', id).eq('status', 'draft'));
    else evoId = (must(await ctx.supabase.from('clinical_evolutions').insert({ ...row, organization_id: ctx.org.id, unit_id: ctx.unitId }).select('id').single()) as { id: string }).id;
    if (finalize) must(await ctx.supabase.rpc('finalize_evolution', { p_id: evoId }));
    revalidatePath(`/app/alunos/${d.patient_id}`);
    return { id: evoId };
  });
}

export async function finalizeEvolution(id: string, patientId: string) {
  return runAction({ permission: 'medical_records.create' }, async (ctx) => {
    must(await ctx.supabase.rpc('finalize_evolution', { p_id: id }));
    revalidatePath(`/app/alunos/${patientId}`);
  });
}

export async function deleteDraftEvolution(id: string, patientId: string) {
  return runAction({ permission: 'medical_records.create' }, async (ctx) => {
    const { error, count } = await ctx.supabase.from('clinical_evolutions').delete({ count: 'exact' }).eq('id', id).eq('status', 'draft');
    if (error) throw error;
    if (!count) throw new UserError('Somente o autor pode excluir um rascunho. Registros finalizados nunca são excluídos.');
    revalidatePath(`/app/alunos/${patientId}`);
  });
}

export async function addEvolutionAddendum(originalId: string, patientId: string, text: string, reason: string) {
  return runAction({ permission: 'medical_records.create' }, async (ctx) => {
    must(await ctx.supabase.rpc('add_evolution_addendum', { p_original_id: originalId, p_text: text, p_reason: reason }));
    revalidatePath(`/app/alunos/${patientId}`);
  });
}

// ---------------------------------------------------------------- Avaliações
const assessSchema = z.object({
  patient_id: z.string().uuid(),
  type: z.enum(['physical', 'postural', 'functional', 'reassessment']),
  assessed_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Informe a data.'),
  staff_id: z.preprocess((v) => (v === '' ? null : v), z.string().uuid().nullable().optional()),
  height_cm: z.preprocess((v) => (v === '' || v == null ? null : Number(String(v).replace(',', '.'))), z.number().min(40).max(250).nullable()),
  weight_kg: z.preprocess((v) => (v === '' || v == null ? null : Number(String(v).replace(',', '.'))), z.number().min(2).max(400).nullable()),
  pain_scale: z.preprocess((v) => (v === '' || v == null ? null : Number(v)), z.number().int().min(0).max(10).nullable()),
  borg_scale: z.preprocess((v) => (v === '' || v == null ? null : Number(v)), z.number().int().min(6).max(20).nullable()),
  data: z.record(z.string().regex(/^[a-z0-9_]+$/), z.union([z.number(), z.string().max(200), z.null()])).default({}),
  postural_findings: t(), notes: t(), conclusion: t(),
  next_assessment_on: z.preprocess((v) => (v === '' ? null : v), z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional()),
  finalize: z.boolean().default(false),
});

export async function saveAssessment(id: string | null, input: z.input<typeof assessSchema>) {
  return runAction({ permission: id ? 'assessments.edit' : 'assessments.create', schema: assessSchema, input }, async (ctx, d) => {
    const { finalize, ...row } = d;
    const clean = { ...row, data: Object.fromEntries(Object.entries(row.data).filter(([, v]) => v !== null && v !== '')), staff_id: row.staff_id ?? ctx.staffId };
    let aid = id;
    if (id) must(await ctx.supabase.from('assessments').update(clean).eq('id', id).eq('status', 'draft'));
    else aid = (must(await ctx.supabase.from('assessments').insert({ ...clean, organization_id: ctx.org.id, unit_id: ctx.unitId }).select('id').single()) as { id: string }).id;
    if (finalize) must(await ctx.supabase.rpc('finalize_assessment', { p_id: aid }));
    revalidatePath('/app', 'layout');
    return { id: aid };
  });
}

/** Upload de foto postural para armazenamento PRIVADO (bucket clinical). */
export async function uploadPosturalPhoto(assessmentId: string, patientId: string, view: string, fd: FormData) {
  return runAction({ permission: 'assessments.create' }, async (ctx) => {
    if (!['anterior', 'posterior', 'right_lateral', 'left_lateral', 'other'].includes(view)) throw new UserError('Vista inválida.');
    const file = fd.get('file');
    if (!(file instanceof File) || !file.size) throw new UserError('Selecione uma foto.');
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) throw new UserError('Use JPG, PNG ou WEBP.');
    if (file.size > 15 * 1024 * 1024) throw new UserError('A foto deve ter no máximo 15 MB.');
    const path = `${ctx.org.id}/patients/${patientId}/postural/${assessmentId}/${view}-${safeFileName(file.name)}`;
    must(await ctx.supabase.storage.from('clinical').upload(path, file, { contentType: file.type }));
    must(await ctx.supabase.from('postural_photos').insert({ organization_id: ctx.org.id, assessment_id: assessmentId, patient_id: patientId, view, storage_path: path }));
    revalidatePath('/app', 'layout');
  });
}

export async function savePhotoAnnotations(photoId: string, annotations: unknown) {
  const schema = z.object({ lines: z.array(z.any()).max(200), angles: z.array(z.any()).max(200), marks: z.array(z.any()).max(200), notes: z.array(z.any()).max(200) });
  return runAction({ permission: 'assessments.edit', schema, input: annotations }, async (ctx, d) => {
    must(await ctx.supabase.from('postural_photos').update({ annotations: d }).eq('id', photoId).eq('organization_id', ctx.org.id));
  });
}

// ---------------------------------------------------------------- Anamnese
export async function createAnamnesis(patientId: string, templateId: string) {
  return runAction({ permission: 'assessments.create' }, async (ctx) => {
    const id = must(await ctx.supabase.rpc('create_anamnesis', { p_patient_id: patientId, p_template_id: templateId })) as string;
    const { data } = await ctx.supabase.from('anamnesis').select('public_token').eq('id', id).single();
    revalidatePath(`/app/alunos/${patientId}`);
    return { id, link: data?.public_token ? `${env.siteUrl}/anamnese/${data.public_token}` : null };
  });
}

export async function submitAnamnesisStaff(id: string, patientId: string, answers: Record<string, unknown>, signature: string) {
  return runAction({ permission: 'assessments.edit' }, async (ctx) => {
    must(await ctx.supabase.rpc('submit_anamnesis', { p_id: id, p_answers: answers, p_signature_name: signature || null }));
    revalidatePath(`/app/alunos/${patientId}`);
  });
}

export async function sendAnamnesisLink(anamnesisId: string, patientId: string, channel: 'whatsapp' | 'email') {
  return runAction({ permission: 'communication.create' }, async (ctx) => {
    const { data } = await ctx.supabase.from('anamnesis').select('public_token, status').eq('id', anamnesisId).single();
    if (!data?.public_token || data.status !== 'pending') throw new UserError('Esta anamnese não está pendente.');
    must(await ctx.supabase.rpc('queue_message', { p_org: ctx.org.id, p_template_key: 'anamnesis_link', p_channel: channel, p_patient_id: patientId, p_lead_id: null,
      p_vars: { link: `${env.siteUrl}/anamnese/${data.public_token}` }, p_custom_body: null, p_scheduled_for: new Date().toISOString(), p_dedupe_key: `anamnesis:${anamnesisId}:${channel}`, p_related_entity: 'anamnesis', p_related_id: anamnesisId }));
    return { message: 'Mensagem colocada na fila de envio.' };
  });
}

// ---------------------------------------------------------------- Anexos
export async function uploadAttachment(patientId: string, fd: FormData) {
  return runAction({ permission: ['documents.create', 'medical_records.create'] }, async (ctx) => {
    const file = fd.get('file');
    const category = String(fd.get('category') ?? 'other');
    const title = String(fd.get('title') ?? '').trim();
    const description = String(fd.get('description') ?? '').trim() || null;
    const isClinical = ['exam', 'medical_report', 'prescription', 'certificate'].includes(category);
    if (!(file instanceof File) || !file.size) throw new UserError('Selecione um arquivo.');
    if (file.size > 20 * 1024 * 1024) throw new UserError('Arquivo muito grande (máx. 20 MB).');
    const bucket = isClinical ? 'clinical' : 'documents';
    if (!ALLOWED_UPLOADS[bucket].includes(file.type)) throw new UserError('Formato não permitido. Envie PDF, JPG ou PNG.');
    if (isClinical && !ctx.can('medical_records.create') && !ctx.can('assessments.create')) throw new UserError('Sem permissão para anexar arquivos clínicos.');
    const path = `${ctx.org.id}/patients/${patientId}/files/${safeFileName(file.name)}`;
    must(await ctx.supabase.storage.from(bucket).upload(path, file, { contentType: file.type }));
    must(await ctx.supabase.from('attachments').insert({ organization_id: ctx.org.id, unit_id: ctx.unitId, patient_id: patientId, category, is_clinical: isClinical,
      title: title || file.name, description, bucket, storage_path: path, mime_type: file.type, size_bytes: file.size }));
    revalidatePath(`/app/alunos/${patientId}`);
  });
}

export async function archiveAttachment(id: string, patientId: string) {
  return runAction({ permission: 'documents.delete' }, async (ctx) => {
    must(await ctx.supabase.from('attachments').update({ deleted_at: new Date().toISOString(), deleted_by: ctx.user.id }).eq('id', id).eq('organization_id', ctx.org.id));
    revalidatePath(`/app/alunos/${patientId}`);
  });
}

// ---------------------------------------------------------------- Programas de exercícios
export async function createProgram(input: { patient_id?: string | null; name: string; goal?: string; is_template?: boolean; start_date?: string }) {
  const schema = z.object({ patient_id: z.string().uuid().nullable().optional(), name: z.string().trim().min(2, 'Informe o nome.').max(120), goal: z.string().max(300).optional(), is_template: z.boolean().default(false), start_date: z.string().optional() });
  return runAction({ permission: 'exercises.create', schema, input }, async (ctx, d) => {
    const row = must(await ctx.supabase.from('patient_programs').insert({ organization_id: ctx.org.id, patient_id: d.is_template ? null : d.patient_id, is_template: d.is_template, name: d.name, goal: d.goal || null, start_date: d.start_date || null, staff_id: ctx.staffId }).select('id').single()) as { id: string };
    revalidatePath('/app', 'layout');
    return { id: row.id };
  });
}

export async function applyProgramTemplate(templateId: string, patientId: string) {
  return runAction({ permission: 'exercises.create' }, async (ctx) => {
    must(await ctx.supabase.rpc('apply_program_template', { p_template_id: templateId, p_patient_id: patientId, p_start_date: new Date().toISOString().slice(0, 10) }));
    revalidatePath(`/app/alunos/${patientId}`);
  });
}

const itemSchema = z.object({
  exercise_id: z.string().uuid('Selecione o exercício.'),
  sets: z.preprocess((v) => (v === '' || v == null ? null : Number(v)), z.number().int().min(1).max(50).nullable()),
  repetitions: t(30), duration_seconds: z.preprocess((v) => (v === '' || v == null ? null : Number(v)), z.number().int().min(1).max(7200).nullable()),
  load: t(60), springs: t(60), notes: t(500), progression: t(500),
});

export async function saveProgramItem(programId: string, itemId: string | null, input: unknown) {
  return runAction({ permission: ['exercises.create', 'exercises.edit'], schema: itemSchema, input }, async (ctx, d) => {
    if (itemId) must(await ctx.supabase.from('patient_program_exercises').update(d).eq('id', itemId));
    else {
      const { count } = await ctx.supabase.from('patient_program_exercises').select('id', { count: 'exact', head: true }).eq('program_id', programId);
      must(await ctx.supabase.from('patient_program_exercises').insert({ ...d, organization_id: ctx.org.id, program_id: programId, sort_order: (count ?? 0) + 1 }));
    }
    revalidatePath('/app', 'layout');
  });
}

export async function removeProgramItem(itemId: string) {
  return runAction({ permission: ['exercises.edit', 'exercises.create'] }, async (ctx) => {
    must(await ctx.supabase.from('patient_program_exercises').delete().eq('id', itemId));
    revalidatePath('/app', 'layout');
  });
}

export async function moveProgramItem(programId: string, itemId: string, dir: -1 | 1) {
  return runAction({ permission: ['exercises.edit', 'exercises.create'] }, async (ctx) => {
    const items = (must(await ctx.supabase.from('patient_program_exercises').select('id, sort_order').eq('program_id', programId).order('sort_order')) ?? []) as { id: string; sort_order: number }[];
    const idx = items.findIndex((i) => i.id === itemId);
    const j = idx + dir;
    if (idx < 0 || j < 0 || j >= items.length) return;
    [items[idx], items[j]] = [items[j], items[idx]];
    await Promise.all(items.map((it, k) => ctx.supabase.from('patient_program_exercises').update({ sort_order: k + 1 }).eq('id', it.id)));
    revalidatePath('/app', 'layout');
  });
}

export async function archiveProgram(id: string) {
  return runAction({ permission: 'exercises.edit' }, async (ctx) => {
    must(await ctx.supabase.from('patient_programs').update({ status: 'archived' }).eq('id', id).eq('organization_id', ctx.org.id));
    revalidatePath('/app', 'layout');
  });
}

// ---------------------------------------------------------------- Documentos
export async function generateDocument(templateId: string, patientId: string) {
  return runAction({ permission: 'documents.create' }, async (ctx) => {
    const id = must(await ctx.supabase.rpc('generate_document', { p_template_id: templateId, p_patient_id: patientId })) as string;
    revalidatePath('/app', 'layout');
    return { id };
  });
}

export async function setDocumentStatus(id: string, status: 'sent' | 'archived') {
  return runAction({ permission: 'documents.edit' }, async (ctx) => {
    must(await ctx.supabase.from('documents').update({ status, ...(status === 'sent' ? { sent_at: new Date().toISOString() } : {}) }).eq('id', id).eq('organization_id', ctx.org.id));
    revalidatePath('/app', 'layout');
  });
}

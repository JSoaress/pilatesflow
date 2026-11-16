'use server';
import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { runAction, must, UserError } from './safe-action';
import { loadTemplate } from '@/lib/evaluation/server';
import { sanitizeAnswers } from '@/lib/evaluation/sanitize';
import { allFields, computeScores, toNum } from '@/lib/evaluation/engine';
import { systemTemplate } from '@/lib/evaluation';
import type { Section } from '@/lib/evaluation/types';

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Informe a data.');
const formSchema = z.object({
  patient_id: z.string().uuid(),
  form_key: z.string().min(3).max(60),
  assessed_on: isoDate,
  staff_id: z.preprocess((v) => (v === '' ? null : v), z.string().uuid().nullable().optional()),
  answers: z.record(z.unknown()).default({}),
  conclusion: z.preprocess((v) => (v === '' ? null : v), z.string().max(8000).nullable().optional()),
  next_assessment_on: z.preprocess((v) => (v === '' ? null : v), isoDate.nullable().optional()),
  finalize: z.boolean().default(false),
});

/** Salva (rascunho) ou finaliza uma avaliação feita com ficha. Os escores são recalculados no servidor. */
export async function saveEvaluationForm(id: string | null, input: z.input<typeof formSchema>) {
  return runAction({ permission: id ? 'assessments.edit' : 'assessments.create', schema: formSchema, input }, async (ctx, d) => {
    const { data: patient } = await ctx.supabase.from('patients').select('id, gender, birth_date, unit_id').eq('id', d.patient_id).eq('organization_id', ctx.org.id).maybeSingle();
    if (!patient) throw new UserError('Aluno não encontrado.');
    let tpl = await loadTemplate(ctx, d.form_key);
    if (id) {
      // rascunho existente: mantém a cópia do modelo com que foi iniciado
      const { data: cur } = await ctx.supabase.from('assessments').select('status, form_schema, form_key, form_name, form_version').eq('id', id).eq('organization_id', ctx.org.id).maybeSingle();
      if (!cur) throw new UserError('Avaliação não encontrada.');
      if (cur.status === 'finalized') throw new UserError('Avaliação finalizada não pode ser alterada.');
      if (cur.form_schema) tpl = { ...(tpl ?? systemTemplate('sys:pilates')!), key: cur.form_key, name: cur.form_name, version: cur.form_version ?? 1, sections: (cur.form_schema as { sections: Section[] }).sections };
    }
    if (!tpl) throw new UserError('Modelo de ficha não encontrado.');
    const answers = sanitizeAnswers(tpl, d.answers);
    const p = patient as { gender: string | null; birth_date: string | null };
    const age = p.birth_date ? Math.floor((Date.parse(d.assessed_on) - Date.parse(p.birth_date)) / (365.25 * 86400000)) : null;
    const scores = computeScores(tpl, answers, { sex: p.gender, age, date: d.assessed_on });
    // valores que alimentam gráficos de evolução
    const mapped: Record<string, number | null> = {};
    for (const f of allFields(tpl)) {
      if (!f.maps) continue;
      const n = toNum(answers[f.id]);
      if (n === null) continue;
      if (f.maps === 'weight_kg' && n >= 2 && n <= 400) mapped.weight_kg = n;
      if (f.maps === 'height_m') { const cm = n > 3 ? n : n * 100; if (cm >= 40 && cm <= 250) mapped.height_cm = Math.round(cm * 10) / 10; }
      if (f.maps === 'pain_scale' && n >= 0 && n <= 10) mapped.pain_scale = Math.round(n);
    }
    const row = {
      patient_id: d.patient_id, assessed_on: d.assessed_on, staff_id: d.staff_id ?? ctx.staffId, type: tpl.assessmentType,
      form_key: tpl.key, form_name: tpl.name, form_version: tpl.version, form_schema: { sections: tpl.sections, summary: tpl.summary ?? [], references: tpl.references ?? [] },
      form_answers: answers, form_scores: scores, conclusion: d.conclusion ?? null, next_assessment_on: d.next_assessment_on ?? null, ...mapped,
    };
    let aid = id;
    if (id) must(await ctx.supabase.from('assessments').update(row).eq('id', id).eq('status', 'draft'));
    else aid = (must(await ctx.supabase.from('assessments').insert({ ...row, organization_id: ctx.org.id, unit_id: (patient as { unit_id: string | null }).unit_id ?? ctx.unitId }).select('id').single()) as { id: string }).id;
    if (d.finalize) must(await ctx.supabase.rpc('finalize_assessment', { p_id: aid }));
    revalidatePath(`/app/alunos/${d.patient_id}`);
    revalidatePath('/app/avaliacoes');
    return { id: aid };
  });
}

// ---------------------------------------------------------------- modelos personalizados
const optSchema = z.object({ value: z.string().min(1).max(60), label: z.string().min(1).max(200), score: z.number().optional() });
const cellSchema = z.object({ type: z.enum(['number', 'text', 'single', 'date']), options: z.array(optSchema).max(40).optional(), unit: z.string().max(20).optional() });
const fieldSchema = z.object({
  id: z.string().regex(/^[a-z0-9_]{1,40}$/, 'Identificador inválido.'),
  label: z.string().trim().min(1, 'Toda pergunta precisa de um texto.').max(300),
  type: z.enum(['text', 'textarea', 'number', 'date', 'yesno', 'single', 'multi', 'scale', 'bp', 'bilateral', 'grid', 'computed', 'info']),
  help: z.string().max(500).optional(), unit: z.string().max(20).optional(),
  min: z.number().optional(), max: z.number().optional(), step: z.number().optional(),
  options: z.array(optSchema).max(60).optional(), other: z.boolean().optional(),
  detail: z.object({ when: z.array(z.string().max(60)).max(20), label: z.string().max(120).optional() }).optional(),
  span: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]).optional(),
  showIf: z.object({ field: z.string().max(40), in: z.array(z.string().max(60)).max(20) }).optional(),
  bilateral: z.object({ sides: z.tuple([z.string(), z.string()]).optional(), cell: cellSchema }).optional(),
  grid: z.object({ rows: z.array(z.object({ id: z.string().max(40), label: z.string().max(120) })).min(1).max(40), columns: z.array(z.object({ id: z.string().max(40), label: z.string().max(60) })).min(1).max(8), cell: cellSchema }).optional(),
  compute: z.any().optional(), bands: z.array(z.object({ min: z.number().optional(), max: z.number().optional(), label: z.string().max(120), tone: z.enum(['ok', 'info', 'warn', 'alert']).optional() })).max(10).optional(),
  decimals: z.number().int().min(0).max(4).optional(), lines: z.number().int().min(1).max(12).optional(),
  maps: z.enum(['weight_kg', 'height_m', 'pain_scale']).optional(), yesNoScore: z.tuple([z.number(), z.number()]).optional(),
});
const templateSchema = z.object({
  name: z.string().trim().min(2, 'Informe o nome da ficha.').max(120),
  specialty: z.string().trim().max(80).optional(),
  description: z.string().trim().max(500).optional(),
  based_on: z.string().max(60).nullable().optional(),
  sections: z.array(z.object({ id: z.string().regex(/^[a-z0-9_]{1,40}$/), title: z.string().trim().min(1, 'Toda seção precisa de um título.').max(160), description: z.string().max(500).optional(), fields: z.array(fieldSchema).max(200) })).min(1, 'Adicione ao menos uma seção.').max(40),
  summary: z.array(z.string().max(40)).max(8).optional(),
});

export async function saveEvaluationTemplate(id: string | null, input: z.input<typeof templateSchema>) {
  return runAction({ permission: ['settings.edit', 'assessments.edit'], schema: templateSchema, input }, async (ctx, d) => {
    const ids = d.sections.flatMap((s) => s.fields.map((f) => f.id));
    const dup = ids.find((x, i) => ids.indexOf(x) !== i);
    if (dup) throw new UserError(`Há duas perguntas com o mesmo identificador (${dup}).`);
    if (!ids.length) throw new UserError('Adicione ao menos uma pergunta.');
    const row = { name: d.name, specialty: d.specialty || null, description: d.description || null, based_on: d.based_on ?? null, schema: { sections: d.sections, summary: (d.summary ?? []).filter((s) => ids.includes(s)) } };
    let tid = id;
    if (id) {
      const { data: cur } = await ctx.supabase.from('evaluation_templates').select('version').eq('id', id).eq('organization_id', ctx.org.id).maybeSingle();
      if (!cur) throw new UserError('Modelo não encontrado.');
      must(await ctx.supabase.from('evaluation_templates').update({ ...row, version: (cur as { version: number }).version + 1 }).eq('id', id));
    } else tid = (must(await ctx.supabase.from('evaluation_templates').insert({ ...row, organization_id: ctx.org.id }).select('id').single()) as { id: string }).id;
    revalidatePath('/app/configuracoes/modelos');
    return { id: tid };
  });
}

export async function setEvaluationTemplateActive(id: string, active: boolean) {
  return runAction({ permission: ['settings.edit', 'assessments.edit'] }, async (ctx) => {
    must(await ctx.supabase.from('evaluation_templates').update({ is_active: active }).eq('id', id).eq('organization_id', ctx.org.id));
    revalidatePath('/app/configuracoes/modelos');
  });
}

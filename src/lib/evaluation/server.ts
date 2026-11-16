import 'server-only';
import type { AppContext } from '@/lib/auth/context';
import { SYSTEM_TEMPLATES, systemTemplate } from './index';
import type { FormTemplate, Section } from './types';

export type TemplateSummary = { key: string; name: string; specialty: string; description: string; system: boolean; fields: number; based_on?: string | null; active?: boolean };

export function rowToTemplate(r: { id: string; name: string; specialty: string | null; description: string | null; schema: { sections: Section[]; summary?: string[] }; version: number }): FormTemplate {
  return { key: r.id, name: r.name, specialty: r.specialty ?? 'Personalizada', description: r.description ?? '', version: r.version, assessmentType: 'clinical_form', sections: r.schema.sections ?? [], summary: r.schema.summary ?? [] };
}

/** Modelo pelo identificador (sistema = 'sys:…', personalizado = uuid). */
export async function loadTemplate(ctx: AppContext, key: string): Promise<FormTemplate | null> {
  if (key.startsWith('sys:')) return systemTemplate(key);
  if (!/^[0-9a-f-]{36}$/.test(key)) return null;
  const { data } = await ctx.supabase.from('evaluation_templates').select('id, name, specialty, description, schema, version').eq('id', key).eq('organization_id', ctx.org.id).maybeSingle();
  return data ? rowToTemplate(data as any) : null;
}

export async function listTemplates(ctx: AppContext, includeInactive = false): Promise<TemplateSummary[]> {
  let q = ctx.supabase.from('evaluation_templates').select('id, name, specialty, description, schema, based_on, is_active').eq('organization_id', ctx.org.id).order('name');
  if (!includeInactive) q = q.eq('is_active', true);
  const { data } = await q;
  const count = (sections: Section[]) => sections.reduce((t, s) => t + s.fields.filter((f) => f.type !== 'info' && f.type !== 'computed').length, 0);
  return [
    ...SYSTEM_TEMPLATES.map((t) => ({ key: t.key, name: t.name, specialty: t.specialty, description: t.description, system: true, fields: count(t.sections) })),
    ...((data ?? []) as any[]).map((r) => ({ key: r.id, name: r.name, specialty: r.specialty ?? 'Personalizada', description: r.description ?? '', system: false, fields: count(r.schema?.sections ?? []), based_on: r.based_on, active: r.is_active })),
  ];
}

/** Reconstrói o modelo gravado na avaliação (cópia do momento em que foi preenchida). */
export function templateFromAssessment(a: { form_key: string; form_name: string | null; form_version: number | null; form_schema: any; type: string }): FormTemplate {
  const base = a.form_key.startsWith('sys:') ? systemTemplate(a.form_key) : null;
  return {
    key: a.form_key, name: a.form_name ?? base?.name ?? 'Ficha', specialty: base?.specialty ?? 'Personalizada', description: base?.description ?? '',
    version: a.form_version ?? 1, assessmentType: (a.type as FormTemplate['assessmentType']) ?? 'clinical_form',
    sections: a.form_schema?.sections ?? base?.sections ?? [], summary: a.form_schema?.summary ?? base?.summary ?? [], references: a.form_schema?.references ?? base?.references ?? [],
  };
}

export const ageAt = (birth: string | null, on: string) => (birth ? Math.floor((Date.parse(on) - Date.parse(birth)) / (365.25 * 86400000)) : null);

'use server';
import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { runAction, must, UserError } from './safe-action';
import { providerCredentials } from '@/lib/integrations/status';
import { ALLOWED_UPLOADS, safeFileName } from '@/lib/storage';

const bool = z.preprocess((v) => v === true || v === 'true' || v === 'on', z.boolean());
const int = (min: number, max: number) => z.coerce.number().int().min(min).max(max);

const SCHEMAS = {
  schedule_rules: z.object({
    replacements_per_month: int(0, 31), replacement_validity_days: int(1, 365), min_cancel_notice_hours: int(0, 168),
    absence_generates_credit: bool, absence_consumes_session: bool, holiday_generates_credit: bool, staff_absence_generates_credit: bool,
    recurrence_horizon_days: int(14, 180), waitlist_hold_hours: int(1, 72), checkin_window_minutes: int(10, 240),
  }),
  automations: z.object({
    appointment_reminder_enabled: bool, appointment_reminder_hours: int(1, 72), payment_due_reminder_enabled: bool, payment_due_reminder_days: int(0, 15),
    overdue_reminder_enabled: bool, overdue_reminder_every_days: int(1, 30), birthday_message_enabled: bool, channel: z.enum(['whatsapp', 'email', 'sms']),
  }),
  online_booking: z.object({ enabled: bool, min_advance_hours: int(0, 168), max_days_ahead: int(1, 180), slot_step_minutes: int(0, 120) }),
  reassessment_interval_days: int(15, 730),
  clinical_retention_years: int(5, 100),
  backup_policy: z.object({ database: z.string().max(500), storage: z.string().max(500), retention_days: int(1, 3650) }),
  website: z.object({
    hero_title: z.string().max(140), hero_subtitle: z.string().max(400), about_title: z.string().max(120), about_text: z.string().max(5000),
    pilates_text: z.string().max(5000), structure_text: z.string().max(3000), cta_label: z.string().max(60), seo_title: z.string().max(70),
    seo_description: z.string().max(170), google_maps_embed_url: z.string().max(1500).refine((v) => !v || v.startsWith('https://www.google.com/maps/embed'), 'Use o link "Incorporar mapa" do Google Maps (https://www.google.com/maps/embed?...).'),
    show_prices: bool, hero_image_path: z.string().max(300).optional().default(''), og_image_path: z.string().max(300).optional().default(''),
    about_long_text: z.string().max(10000).optional().default(''), pilates_long_text: z.string().max(10000).optional().default(''),
  }),
} as const;

export type SettingKey = keyof typeof SCHEMAS;

/** Salva uma configuração validada (system_settings). */
export async function saveSetting(key: SettingKey, value: unknown) {
  const schema = SCHEMAS[key];
  if (!schema) return { ok: false as const, error: 'Configuração desconhecida.' };
  return runAction({ permission: key === 'website' ? ['website.edit', 'settings.edit'] : 'settings.edit', schema: schema as z.ZodTypeAny, input: value }, async (ctx, d) => {
    must(await ctx.supabase.from('system_settings').upsert({ organization_id: ctx.org.id, key, value: d, updated_by: ctx.user.id, updated_at: new Date().toISOString() }));
    revalidatePath('/', 'layout');
  });
}

const integSchema = z.object({ enabled: bool, config: z.record(z.string().max(60), z.string().max(300)).default({}) });

/** Ativa/desativa integração. O status "Conectado" só é atribuído quando as credenciais existem no servidor. */
export async function saveIntegration(provider: string, input: z.input<typeof integSchema>) {
  return runAction({ permission: 'settings.edit', schema: integSchema, input }, async (ctx, d) => {
    const creds = providerCredentials();
    const hasCreds = !!creds[provider];
    const status = !d.enabled ? 'not_connected' : hasCreds ? 'connected' : 'config_required';
    must(await ctx.supabase.from('integrations').upsert({
      organization_id: ctx.org.id, provider, enabled: d.enabled, config: d.config, status,
      last_error: d.enabled && !hasCreds ? 'Credenciais não configuradas nas variáveis de ambiente do servidor.' : null,
      connected_at: status === 'connected' ? new Date().toISOString() : null, connected_by: status === 'connected' ? ctx.user.id : null, last_checked_at: new Date().toISOString(),
    }, { onConflict: 'organization_id,provider' }));
    revalidatePath('/app/configuracoes/integracoes');
    return { status };
  });
}

/** Upload de logo/imagens do site (bucket público "site"). */
export async function uploadSiteImage(fd: FormData, purpose: 'logo' | 'hero' | 'gallery' | 'team' | 'blog') {
  return runAction({ permission: ['website.edit', 'settings.edit'] }, async (ctx) => {
    const file = fd.get('file');
    if (!(file instanceof File) || !file.size) throw new UserError('Selecione uma imagem.');
    if (!ALLOWED_UPLOADS.site.includes(file.type)) throw new UserError('Use JPG, PNG, WEBP ou SVG.');
    if (file.size > 8 * 1024 * 1024) throw new UserError('Imagem muito grande (máx. 8 MB).');
    const path = `${ctx.org.id}/${purpose}/${safeFileName(file.name)}`;
    must(await ctx.supabase.storage.from('site').upload(path, file, { contentType: file.type, cacheControl: '31536000' }));
    if (purpose === 'logo') must(await ctx.supabase.from('organizations').update({ logo_path: path }).eq('id', ctx.org.id));
    if (purpose === 'gallery') must(await ctx.supabase.from('site_gallery').insert({ organization_id: ctx.org.id, image_path: path, caption: String(fd.get('caption') ?? '') || null, section: String(fd.get('section') ?? 'structure') }));
    if (purpose === 'team') {
      const staffId = String(fd.get('staff_id') ?? '');
      if (staffId) must(await ctx.supabase.from('staff').update({ public_photo_path: path }).eq('id', staffId).eq('organization_id', ctx.org.id));
    }
    revalidatePath('/', 'layout');
    return { path };
  });
}

export async function removeGalleryImage(id: string) {
  return runAction({ permission: ['website.edit'] }, async (ctx) => {
    must(await ctx.supabase.from('site_gallery').delete().eq('id', id).eq('organization_id', ctx.org.id));
    revalidatePath('/', 'layout');
  });
}

export async function publishLegalDocument(id: string) {
  return runAction({ permission: 'lgpd.manage' }, async (ctx) => {
    must(await ctx.supabase.rpc('publish_legal_document', { p_id: id }));
    revalidatePath('/', 'layout');
  });
}

export async function anonymizePatient(patientId: string, requestId?: string | null) {
  return runAction({ permission: 'lgpd.manage' }, async (ctx) => {
    must(await ctx.supabase.rpc('anonymize_patient', { p_patient_id: patientId, p_request_id: requestId ?? null }));
    revalidatePath('/app', 'layout');
  });
}

export async function updateProfile(input: { full_name: string; phone?: string }) {
  const schema = z.object({ full_name: z.string().trim().min(2, 'Informe seu nome.').max(120), phone: z.string().max(30).optional() });
  return runAction({ schema, input }, async (ctx, d) => {
    must(await ctx.supabase.from('profiles').update({ full_name: d.full_name, phone: d.phone || null }).eq('id', ctx.user.id));
    revalidatePath('/app', 'layout');
  });
}

const evoTplSchema = z.object({
  name: z.string().trim().min(2, 'Informe o nome do modelo.').max(120),
  is_active: bool,
  defaults: z.object({
    patient_state: z.string().max(3000).optional().default(''), complaints: z.string().max(3000).optional().default(''),
    treatment_response: z.string().max(3000).optional().default(''), guidance: z.string().max(3000).optional().default(''),
    next_conduct: z.string().max(3000).optional().default(''), notes: z.string().max(3000).optional().default(''),
  }),
});

/** Modelos de evolução (valores sugeridos ao registrar a evolução). */
export async function saveEvolutionTemplate(id: string | null, input: z.input<typeof evoTplSchema>) {
  return runAction({ permission: ['settings.edit', 'medical_records.edit'], schema: evoTplSchema, input }, async (ctx, d) => {
    const defaults = Object.fromEntries(Object.entries(d.defaults).filter(([, v]) => v));
    if (id) must(await ctx.supabase.from('evolution_templates').update({ name: d.name, is_active: d.is_active, defaults }).eq('id', id).eq('organization_id', ctx.org.id));
    else must(await ctx.supabase.from('evolution_templates').insert({ organization_id: ctx.org.id, name: d.name, is_active: d.is_active, defaults, created_by: ctx.user.id }));
    revalidatePath('/app/configuracoes/modelos');
  });
}


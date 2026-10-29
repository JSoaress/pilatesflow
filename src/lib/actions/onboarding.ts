'use server';
import { z } from 'zod';
import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { friendlyError } from '@/lib/errors';
import { optCNPJ, optEmail, optPhone, optText } from '@/lib/validation/common';
import { ORG_COOKIE } from '@/lib/auth/context';
import { runAction, must } from './safe-action';

const orgSchema = z.object({
  name: z.string().trim().min(2, 'Informe o nome da clínica.').max(120),
  legal_name: optText(160),
  cnpj: optCNPJ,
  email: optEmail,
  phone: optPhone,
  whatsapp: optPhone,
  website: optText(200),
  instagram: optText(100),
  timezone: z.string().default('America/Sao_Paulo'),
});

export async function createOrganizationAction(input: unknown) {
  const parsed = orgSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: parsed.error.issues[0].message };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('create_organization', { p: parsed.data });
  if (error) return { ok: false as const, error: friendlyError(error) };
  (await cookies()).set(ORG_COOKIE, String(data), { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/', maxAge: 31536000 });
  return { ok: true as const, data: String(data) };
}

export async function updateOrganizationAction(input: unknown) {
  return runAction({ permission: 'settings.edit', schema: orgSchema.extend({ app_name: optText(40), primary_color: optText(7) }), input }, async (ctx, d) => {
    const { timezone, ...rest } = d;
    must(await ctx.supabase.from('organizations').update({ ...rest, timezone, app_name: d.app_name || 'PilatesFlow', primary_color: d.primary_color || '#3F6F5E' }).eq('id', ctx.org.id));
    revalidatePath('/', 'layout');
  });
}

export async function setOnboardingStep(step: number) {
  return runAction({ permission: 'settings.edit' }, async (ctx) => {
    must(await ctx.supabase.from('organizations').update({ onboarding_step: Math.max(ctx.org.onboarding_step, step) }).eq('id', ctx.org.id));
  });
}

export async function completeOnboarding() {
  return runAction({ permission: 'settings.edit' }, async (ctx) => {
    must(await ctx.supabase.from('organizations').update({ onboarding_completed_at: new Date().toISOString(), onboarding_step: 10 }).eq('id', ctx.org.id));
    revalidatePath('/', 'layout');
  });
}

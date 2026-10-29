'use server';
import { z } from 'zod';
import { headers } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { friendlyError } from '@/lib/errors';

type Res<T = unknown> = { ok: true; data?: T } | { ok: false; error: string };

export async function submitPublicAnamnesis(token: string, answers: Record<string, unknown>, signature: string): Promise<Res> {
  if (!z.string().uuid().safeParse(token).success) return { ok: false, error: 'Link inválido.' };
  const supabase = await createClient();
  const { error } = await supabase.rpc('submit_anamnesis_by_token', { p_token: token, p_answers: answers, p_signature_name: signature });
  if (error) return { ok: false, error: friendlyError(error) };
  return { ok: true };
}

const leadSchema = z.object({
  name: z.string().trim().min(2, 'Informe seu nome.').max(120),
  phone: z.string().trim().min(10, 'Informe um telefone com DDD.').max(30),
  email: z.string().trim().max(160).optional().default(''),
  interest: z.string().max(200).optional().default(''),
  message: z.string().max(2000).optional().default(''),
  consent: z.boolean(),
  website: z.string().max(0).optional(), // honeypot anti-spam
});

export async function submitLead(slug: string, input: z.input<typeof leadSchema>): Promise<Res> {
  const parsed = leadSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  if (parsed.data.website) return { ok: true }; // bot
  const supabase = await createClient();
  const h = await headers();
  const { error } = await supabase.rpc('public_create_lead', {
    p_slug: slug, p_name: parsed.data.name, p_phone: parsed.data.phone, p_email: parsed.data.email || null, p_interest: parsed.data.interest || null,
    p_message: parsed.data.message || null, p_consent: parsed.data.consent, p_utm: { referer: h.get('referer')?.slice(0, 200) ?? null }, p_origin: 'website',
  });
  if (error) return { ok: false, error: friendlyError(error) };
  return { ok: true };
}

export async function fetchSlots(slug: string, unitId: string, serviceId: string, date: string, staffId?: string | null): Promise<Res<any[]>> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('public_available_slots', { p_slug: slug, p_unit: unitId, p_service: serviceId, p_date: date, p_staff: staffId || null });
  if (error) return { ok: false, error: friendlyError(error) };
  return { ok: true, data: (data ?? []) as any[] };
}

export async function bookTrial(slug: string, input: Record<string, unknown>): Promise<Res<{ starts_at: string; service: string; staff: string | null }>> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('public_book_trial', { p_slug: slug, p: input });
  if (error) return { ok: false, error: friendlyError(error) };
  return { ok: true, data: data as any };
}

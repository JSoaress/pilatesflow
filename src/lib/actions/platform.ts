'use server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { getUser } from '@/lib/auth/context';
import { friendlyError } from '@/lib/errors';
import type { ActionResult } from './safe-action';

const schema = z.object({
  orgId: z.string().uuid(),
  action: z.enum(['extend_trial', 'activate', 'suspend']),
  days: z.number().int().min(1).max(3660).nullable(),
  note: z.string().trim().max(500).nullable(),
});

/** Libera, estende ou suspende a licença de uma clínica (somente administradores da plataforma — verificado no banco). */
export async function setOrgLicense(input: z.input<typeof schema>): Promise<ActionResult> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Dados inválidos.' };
  const { supabase, user } = await getUser();
  if (!user) return { ok: false, error: 'Faça login novamente.' };
  const d = parsed.data;
  const { error } = await supabase.rpc('platform_set_license', { p_org: d.orgId, p_action: d.action, p_days: d.days, p_note: d.note || null });
  if (error) return { ok: false, error: friendlyError(error) };
  revalidatePath('/plataforma');
  return { ok: true };
}

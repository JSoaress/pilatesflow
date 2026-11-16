import 'server-only';
import { cache } from 'react';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { sessionUser } from '@/lib/supabase/claims';

export type PortalPatient = {
  patient_id: string; organization_id: string; organization_name: string; organization_slug: string; logo_path: string | null;
  full_name: string; social_name: string | null; email: string | null; phone: string | null; whatsapp: string | null; checkin_token: string;
  address_street: string | null; address_number: string | null; address_complement: string | null; address_district: string | null;
  address_city: string | null; address_state: string | null; address_zip: string | null;
  balance: { plan_name: string | null; sessions_total: number | null; sessions_used: number | null; sessions_remaining: number | null; end_date: string | null; replacement_credits: number; next_credit_expiration: string | null; subscription_id: string | null };
  unread_notifications: number;
};

/** Contexto do Portal do Aluno: somente dados do próprio aluno (via RPCs restritas). */
export const getPortalContext = cache(async (wanted?: string) => {
  const supabase = await createClient();
  const user = await sessionUser(supabase);
  if (!user) redirect('/login?next=/portal');
  const { data } = await supabase.rpc('portal_me');
  const list = (data ?? []) as PortalPatient[];
  if (!list.length) redirect('/entrar');
  const me = list.find((p) => p.patient_id === wanted) ?? list[0];
  return { supabase, user, me, all: list };
});

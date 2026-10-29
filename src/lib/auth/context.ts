import 'server-only';
import { cache } from 'react';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { createClient, type DB } from '@/lib/supabase/server';

export type OrgSummary = {
  id: string; name: string; slug: string; logo_path: string | null; app_name: string; timezone: string;
  onboarding_completed_at: string | null; onboarding_step: number; role_key: string; role_name: string; all_units: boolean;
};
export type UnitSummary = { id: string; name: string };

export type AppContext = {
  supabase: DB;
  user: { id: string; email: string | null };
  profile: { full_name: string | null; avatar_path: string | null; theme: string } | null;
  org: OrgSummary;
  orgs: OrgSummary[];
  permissions: Set<string>;
  can: (perm: string) => boolean;
  units: UnitSummary[];
  /** unidade selecionada (null = todas/consolidado) */
  unitId: string | null;
  tz: string;
  staffId: string | null;
};

export const ORG_COOKIE = 'pf_org';
export const UNIT_COOKIE = 'pf_unit';

/** Usuário autenticado (ou null). */
export const getUser = cache(async () => {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  return { supabase, user: data.user };
});

/** Contexto completo da área administrativa. Redireciona se não houver sessão/organização. */
export const getAppContext = cache(async (): Promise<AppContext> => {
  const { supabase, user } = await getUser();
  if (!user) redirect('/login');

  const [{ data: orgsData }, { data: profile }] = await Promise.all([
    supabase.rpc('my_organizations'),
    supabase.from('profiles').select('full_name, avatar_path, theme, last_organization_id').eq('id', user.id).maybeSingle(),
  ]);
  const orgs = (orgsData ?? []) as OrgSummary[];
  if (!orgs.length) {
    // pode ser um aluno (portal) ou alguém que ainda não criou a clínica
    const { data: portal } = await supabase.rpc('portal_me');
    if (Array.isArray(portal) && portal.length) redirect('/portal');
    redirect('/onboarding');
  }

  const store = await cookies();
  const wanted = store.get(ORG_COOKIE)?.value ?? profile?.last_organization_id;
  const org = orgs.find((o) => o.id === wanted) ?? orgs[0];

  const [{ data: perms }, { data: units }, { data: staff }] = await Promise.all([
    supabase.rpc('my_permissions', { p_org: org.id }),
    supabase.from('units').select('id, name').eq('organization_id', org.id).is('deleted_at', null).eq('is_active', true).order('created_at'),
    supabase.from('staff').select('id').eq('organization_id', org.id).eq('user_id', user.id).is('deleted_at', null).maybeSingle(),
  ]);
  const permissions = new Set<string>(((perms ?? []) as unknown[]).map((p) => (typeof p === 'string' ? p : String((p as any).my_permissions ?? p))));
  const unitList = (units ?? []) as UnitSummary[];
  const unitCookie = store.get(UNIT_COOKIE)?.value;
  let unitId: string | null = unitCookie && unitCookie !== 'all' && unitList.some((u) => u.id === unitCookie) ? unitCookie : null;
  if (!unitId && !org.all_units && unitList.length) unitId = unitList[0].id;

  return {
    supabase,
    user: { id: user.id, email: user.email ?? null },
    profile: profile ? { full_name: profile.full_name, avatar_path: profile.avatar_path, theme: profile.theme } : null,
    org,
    orgs,
    permissions,
    can: (perm: string) => permissions.has(perm),
    units: unitList,
    unitId,
    tz: org.timezone || 'America/Sao_Paulo',
    staffId: (staff as { id: string } | null)?.id ?? null,
  };
});

/** Exige permissão na página; caso contrário mostra 403 amigável. */
export async function requirePermission(perm: string | string[]) {
  const ctx = await getAppContext();
  const list = Array.isArray(perm) ? perm : [perm];
  if (!list.some((p) => ctx.can(p))) redirect('/app/sem-permissao');
  return ctx;
}

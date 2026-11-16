import 'server-only';
import { cache } from 'react';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { createClient, type DB } from '@/lib/supabase/server';
import { sessionUser } from '@/lib/supabase/claims';

export type OrgSummary = {
  id: string; name: string; slug: string; logo_path: string | null; app_name: string; timezone: string;
  onboarding_completed_at: string | null; onboarding_step: number; role_key: string; role_name: string; all_units: boolean;
};
export type UnitSummary = { id: string; name: string };
export type LicenseInfo = { status: 'trial' | 'active' | 'suspended'; ok: boolean; until: string | null; trial_ends_at: string | null; expires_at: string | null };

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
  /** situação da licença de uso da clínica (teste de 7 dias, ativa, suspensa) */
  license: LicenseInfo;
  isPlatformAdmin: boolean;
};

export const ORG_COOKIE = 'pf_org';
export const UNIT_COOKIE = 'pf_unit';

/** Compatibilidade: monta o contexto com consultas separadas se a função app_bootstrap ainda não existir no banco. */
async function legacyBootstrap(supabase: DB, userId: string, wanted?: string) {
  const [{ data: orgsData }, { data: profile }] = await Promise.all([
    supabase.rpc('my_organizations'),
    supabase.from('profiles').select('full_name, avatar_path, theme, last_organization_id').eq('id', userId).maybeSingle(),
  ]);
  const orgs = (orgsData ?? []) as OrgSummary[];
  if (!orgs.length) {
    const { data: portal } = await supabase.rpc('portal_me');
    return { orgs, is_patient: Array.isArray(portal) && portal.length > 0 };
  }
  const org = orgs.find((o) => o.id === wanted) ?? orgs.find((o) => o.id === (profile as any)?.last_organization_id) ?? orgs[0];
  const [{ data: perms }, { data: units }, { data: staff }] = await Promise.all([
    supabase.rpc('my_permissions', { p_org: org.id }),
    supabase.from('units').select('id, name').eq('organization_id', org.id).is('deleted_at', null).eq('is_active', true).order('created_at'),
    supabase.from('staff').select('id').eq('organization_id', org.id).eq('user_id', userId).is('deleted_at', null).maybeSingle(),
  ]);
  return {
    orgs, org_id: org.id, units: units ?? [], staff_id: (staff as { id: string } | null)?.id ?? null,
    profile: profile ? { full_name: (profile as any).full_name, avatar_path: (profile as any).avatar_path, theme: (profile as any).theme } : null,
    permissions: ((perms ?? []) as unknown[]).map((p) => (typeof p === 'string' ? p : String((p as any).my_permissions ?? p))),
  };
}

/** Usuário autenticado (ou null). */
export const getUser = cache(async () => {
  const supabase = await createClient();
  const user = await sessionUser(supabase);
  return { supabase, user };
});

/** Contexto completo da área administrativa (uma única chamada ao banco). Redireciona se não houver sessão/organização. */
export const getAppContext = cache(async (): Promise<AppContext> => {
  const { supabase, user } = await getUser();
  if (!user) redirect('/login');

  const store = await cookies();
  const wanted = store.get(ORG_COOKIE)?.value;
  const { data: boot, error: bootError } = await supabase.rpc('app_bootstrap', { p_org: wanted && /^[0-9a-f-]{36}$/.test(wanted) ? wanted : null });
  const b = (bootError ? await legacyBootstrap(supabase, user.id, wanted) : boot ?? {}) as { orgs?: OrgSummary[]; org_id?: string; profile?: AppContext['profile']; permissions?: string[]; units?: UnitSummary[]; staff_id?: string | null; is_patient?: boolean; license?: LicenseInfo; is_platform_admin?: boolean };
  const orgs = b.orgs ?? [];
  if (!orgs.length) {
    // pode ser um aluno (portal) ou alguém que ainda não criou a clínica
    if (b.is_patient) redirect('/portal');
    redirect('/onboarding');
  }
  const org = orgs.find((o) => o.id === b.org_id) ?? orgs[0];
  const permissions = new Set<string>(b.permissions ?? []);
  const unitList = b.units ?? [];
  const unitCookie = store.get(UNIT_COOKIE)?.value;
  let unitId: string | null = unitCookie && unitCookie !== 'all' && unitList.some((u) => u.id === unitCookie) ? unitCookie : null;
  if (!unitId && !org.all_units && unitList.length) unitId = unitList[0].id;

  return {
    supabase,
    user,
    profile: b.profile ?? null,
    org,
    orgs,
    permissions,
    can: (perm: string) => permissions.has(perm),
    units: unitList,
    unitId,
    tz: org.timezone || 'America/Sao_Paulo',
    staffId: b.staff_id ?? null,
    // sem a migração de licença no banco, considera liberado
    license: b.license ?? { status: 'active', ok: true, until: null, trial_ends_at: null, expires_at: null },
    isPlatformAdmin: !!b.is_platform_admin,
  };
});

/** Exige permissão na página; caso contrário mostra 403 amigável. */
export async function requirePermission(perm: string | string[]) {
  const ctx = await getAppContext();
  const list = Array.isArray(perm) ? perm : [perm];
  if (!list.some((p) => ctx.can(p))) redirect('/app/sem-permissao');
  return ctx;
}

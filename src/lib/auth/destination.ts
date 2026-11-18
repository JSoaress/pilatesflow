import type { createClient } from '@/lib/supabase/server';

type Supabase = Awaited<ReturnType<typeof createClient>>;

/** Decide o destino pós-login: área da clínica, portal do aluno ou onboarding. */
export async function postLoginPath(supabase: Supabase): Promise<string> {
  const { data: orgs } = await supabase.rpc('my_organizations');
  if (Array.isArray(orgs) && orgs.length) {
    const pending = orgs.find(
      (o: { onboarding_completed_at: string | null; role_key: string }) => !o.onboarding_completed_at && o.role_key === 'owner',
    );
    return pending ? '/onboarding' : '/app';
  }
  const { data: portal } = await supabase.rpc('portal_me');
  if (Array.isArray(portal) && portal.length) return '/portal';
  return '/onboarding';
}

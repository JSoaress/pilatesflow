import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { sessionUser } from '@/lib/supabase/claims';
import { publicOrigin } from '@/lib/origin';

/** Decide o destino após o login: área da clínica, portal do aluno ou onboarding. */
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const user = await sessionUser(supabase);
  const origin = publicOrigin(request);
  if (!user) return NextResponse.redirect(new URL('/login', origin));
  const { data: orgs } = await supabase.rpc('my_organizations');
  if (Array.isArray(orgs) && orgs.length) {
    const pending = orgs.find((o: { onboarding_completed_at: string | null; role_key: string }) => !o.onboarding_completed_at && o.role_key === 'owner');
    return NextResponse.redirect(new URL(pending ? '/onboarding' : '/app', origin));
  }
  const { data: portal } = await supabase.rpc('portal_me');
  if (Array.isArray(portal) && portal.length) return NextResponse.redirect(new URL('/portal', origin));
  return NextResponse.redirect(new URL('/onboarding', origin));
}

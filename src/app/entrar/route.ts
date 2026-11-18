import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { sessionUser } from '@/lib/supabase/claims';
import { publicOrigin } from '@/lib/origin';
import { postLoginPath } from '@/lib/auth/destination';

/** Decide o destino após o login: área da clínica, portal do aluno ou onboarding. */
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const user = await sessionUser(supabase);
  const origin = publicOrigin(request);
  if (!user) return NextResponse.redirect(new URL('/login', origin));
  const dest = await postLoginPath(supabase);
  return NextResponse.redirect(new URL(dest, origin));
}

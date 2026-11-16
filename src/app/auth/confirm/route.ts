import { NextResponse, type NextRequest } from 'next/server';
import type { EmailOtpType } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import { publicOrigin } from '@/lib/origin';

/** Confirmação via token_hash (modelos de e-mail do Supabase com {{ .TokenHash }}). */
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const token_hash = url.searchParams.get('token_hash');
  const type = url.searchParams.get('type') as EmailOtpType | null;
  const nextParam = url.searchParams.get('next') ?? '/entrar';
  const next = nextParam.startsWith('/') && !nextParam.startsWith('//') ? nextParam : '/entrar';
  const origin = publicOrigin(request);
  if (token_hash && type) {
    const supabase = await createClient();
    const { error } = await supabase.auth.verifyOtp({ type, token_hash });
    if (!error) return NextResponse.redirect(new URL(type === 'recovery' ? '/redefinir-senha' : type === 'invite' ? '/convite' : next, origin));
  }
  return NextResponse.redirect(new URL('/login?erro=' + encodeURIComponent('Link inválido ou expirado.'), origin));
}

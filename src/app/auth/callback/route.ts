import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { publicOrigin } from '@/lib/origin';

/** Troca o código do link de e-mail (confirmação, convite, recuperação) por sessão. */
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const nextParam = url.searchParams.get('next') ?? '/entrar';
  const next = nextParam.startsWith('/') && !nextParam.startsWith('//') ? nextParam : '/entrar';
  const origin = publicOrigin(request);
  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL(next, origin));
  }
  return NextResponse.redirect(new URL('/login?erro=' + encodeURIComponent('Link inválido ou expirado. Solicite um novo.'), origin));
}

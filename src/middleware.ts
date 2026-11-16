import { NextResponse, type NextRequest } from 'next/server';
import { updateSession } from '@/lib/supabase/middleware';

const PROTECTED = ['/app', '/portal', '/onboarding', '/imprimir', '/licenca', '/plataforma'];
const AUTH_PAGES = ['/login', '/cadastro', '/recuperar-senha'];

export async function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const { response, user } = await updateSession(request);

  if (!user && PROTECTED.some((p) => pathname === p || pathname.startsWith(p + '/'))) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    url.search = `?next=${encodeURIComponent(pathname + search)}`;
    return NextResponse.redirect(url);
  }
  if (user && AUTH_PAGES.includes(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = '/entrar';
    url.search = '';
    return NextResponse.redirect(url);
  }
  // Áreas autenticadas não devem ser armazenadas em cache compartilhado
  if (PROTECTED.some((p) => pathname.startsWith(p))) {
    response.headers.set('Cache-Control', 'private, no-store');
  }
  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|icons/|sw.js|manifest.webmanifest|robots.txt|sitemap.xml|api/webhooks|api/cron).*)'],
};

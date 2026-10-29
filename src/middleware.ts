import { NextResponse, type NextRequest } from 'next/server';
import { updateSession } from '@/lib/supabase/middleware';
import { env } from '@/lib/env';

const PROTECTED = ['/app', '/portal', '/onboarding'];
const AUTH_PAGES = ['/login', '/cadastro'];

export async function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const { response, user } = await updateSession(request);

  if (!user && PROTECTED.some((p) => pathname === p || pathname.startsWith(p + '/'))) {
    const url = new URL('/login', env.siteUrl);
    url.search = `?next=${encodeURIComponent(pathname + search)}`;
    return NextResponse.redirect(url);
  }
  if (user && AUTH_PAGES.includes(pathname)) {
    const url = new URL('/entrar', env.siteUrl);
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

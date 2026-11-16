import type { NextRequest } from 'next/server';

/**
 * Origem pública da requisição (ex.: http://localhost:3000), derivada dos cabeçalhos
 * encaminhados pelo gateway (nginx: Host + X-Forwarded-Proto).
 *
 * Necessário porque, atrás do proxy e com `next dev -H 0.0.0.0 -p 3001`, o `request.url`
 * de um route handler reflete o endereço de bind do servidor (http://0.0.0.0:3001) em vez
 * do host que o navegador usou — o que fazia os redirects saltarem para 0.0.0.0:3001.
 */
export function publicOrigin(req: NextRequest | Request): string {
  const h = req.headers;
  const host = h.get('x-forwarded-host') ?? h.get('host');
  const proto = h.get('x-forwarded-proto') ?? 'http';
  if (host) return `${proto}://${host}`;
  try {
    return new URL(req.url).origin;
  } catch {
    return '';
  }
}

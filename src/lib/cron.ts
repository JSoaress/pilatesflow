import 'server-only';
import crypto from 'node:crypto';
import { serverEnv } from '@/lib/env';

/** Autoriza chamadas de rotina (Vercel Cron envia "Authorization: Bearer CRON_SECRET"). */
export function cronAuthorized(req: Request) {
  const secret = serverEnv().cronSecret;
  if (!secret) return false;
  const got = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
  const a = Buffer.from(got), b = Buffer.from(secret);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

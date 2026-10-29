import 'server-only';
import { serverEnv } from '@/lib/env';

type Level = 'info' | 'warn' | 'error';

/**
 * Registro de eventos/erros técnicos. Os detalhes técnicos ficam apenas no log
 * do servidor; o usuário recebe sempre uma mensagem amigável.
 * Preparado para Sentry: defina SENTRY_DSN e instale @sentry/nextjs (ver README).
 */
export function log(level: Level, message: string, meta?: Record<string, unknown>) {
  const entry = { ts: new Date().toISOString(), level, message, ...sanitize(meta) };
  const line = JSON.stringify(entry);
  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.info(line);
}

export function captureException(error: unknown, context?: Record<string, unknown>) {
  const err = error as { message?: string; code?: string; stack?: string; details?: string; hint?: string };
  log('error', err?.message ?? String(error), { code: err?.code, details: err?.details, hint: err?.hint, stack: err?.stack, ...context });
  if (serverEnv().sentryDsn) {
    // Integração Sentry: substitua por Sentry.captureException(error, { extra: context }) após instalar @sentry/nextjs.
  }
}

const SENSITIVE = /(password|senha|token|secret|cpf|authorization|cookie|card)/i;
function sanitize(meta?: Record<string, unknown>) {
  if (!meta) return {};
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(meta)) out[k] = SENSITIVE.test(k) ? '[omitido]' : v;
  return out;
}

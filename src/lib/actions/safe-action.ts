import 'server-only';
import { z } from 'zod';
import { friendlyError } from '@/lib/errors';
import { captureException } from '@/lib/observability';
import { getAppContext, type AppContext } from '@/lib/auth/context';

export type ActionResult<T = unknown> = { ok: true; data?: T; message?: string } | { ok: false; error: string; fieldErrors?: Record<string, string> };

/** Lança um erro de regra de negócio com mensagem para o usuário. */
export class UserError extends Error {}

export function zodFieldErrors(err: z.ZodError) {
  const out: Record<string, string> = {};
  for (const issue of err.issues) {
    const key = issue.path.join('.') || '_';
    if (!out[key]) out[key] = issue.message;
  }
  return out;
}

/**
 * Envolve uma Server Action: carrega o contexto (sessão + organização), verifica a
 * permissão no servidor, valida a entrada com zod e converte erros em mensagens amigáveis.
 */
export async function runAction<S extends z.ZodTypeAny, T>(
  opts: { permission?: string | string[]; schema?: S; input?: unknown; /** permite rodar mesmo com a licença vencida (ex.: trocar de clínica) */ allowUnlicensed?: boolean },
  fn: (ctx: AppContext, data: z.infer<S>) => Promise<T>,
): Promise<ActionResult<T>> {
  try {
    const ctx = await getAppContext();
    if (!ctx.license.ok && !opts.allowUnlicensed) return { ok: false, error: ctx.license.status === 'suspended' ? 'O acesso desta clínica está suspenso. Fale com o suporte.' : 'O período de uso desta clínica terminou. Fale com o suporte para liberar.' };
    if (opts.permission) {
      const perms = Array.isArray(opts.permission) ? opts.permission : [opts.permission];
      if (!perms.some((p) => ctx.can(p))) return { ok: false, error: 'Você não tem permissão para esta ação.' };
    }
    let data: z.infer<S> = opts.input as z.infer<S>;
    if (opts.schema) {
      const parsed = opts.schema.safeParse(opts.input);
      if (!parsed.success) {
        const fieldErrors = zodFieldErrors(parsed.error);
        return { ok: false, error: Object.values(fieldErrors)[0] ?? 'Dados inválidos.', fieldErrors };
      }
      data = parsed.data;
    }
    const result = await fn(ctx, data);
    return { ok: true, data: result };
  } catch (e) {
    // redirect()/notFound() do Next devem propagar
    if (e && typeof e === 'object' && 'digest' in e && String((e as { digest?: string }).digest).startsWith('NEXT_')) throw e;
    if (e instanceof UserError) return { ok: false, error: e.message };
    captureException(e, { where: 'server-action' });
    return { ok: false, error: friendlyError(e) };
  }
}

/** Lança se a resposta do Supabase tiver erro (para usar dentro de runAction). */
export function must<T>(res: { data: T; error: unknown }): T {
  if (res.error) throw res.error;
  return res.data;
}

/** Converte FormData em objeto simples (campos múltiplos viram array). */
export function formToObject(fd: FormData) {
  const obj: Record<string, unknown> = {};
  for (const [k, v] of fd.entries()) {
    if (k.startsWith('$ACTION')) continue;
    const val = typeof v === 'string' ? v : v;
    if (k.endsWith('[]')) {
      const key = k.slice(0, -2);
      (obj[key] as unknown[] | undefined)?.push(val) ?? (obj[key] = [val]);
    } else obj[k] = val;
  }
  return obj;
}

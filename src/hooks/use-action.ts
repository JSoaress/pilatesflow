'use client';
import * as React from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';

export type ActionResult<T = unknown> = { ok: true; data?: T; message?: string } | { ok: false; error: string; fieldErrors?: Record<string, string> };

/**
 * Executa uma Server Action com estado de carregamento, mensagens de sucesso/erro
 * e atualização da página (os dados voltam do banco após salvar).
 */
export function useAction<A extends unknown[], T>(action: (...args: A) => Promise<ActionResult<T>>, opts?: { success?: string | ((data: T | undefined) => string); refresh?: boolean; onSuccess?: (data: T | undefined) => void }) {
  const router = useRouter();
  const [pending, setPending] = React.useState(false);
  const [fieldErrors, setFieldErrors] = React.useState<Record<string, string>>({});
  const run = React.useCallback(async (...args: A): Promise<ActionResult<T>> => {
    setPending(true);
    setFieldErrors({});
    try {
      const res = await action(...args);
      if (res.ok) {
        const msg = typeof opts?.success === 'function' ? opts.success(res.data) : opts?.success ?? res.message;
        if (msg) toast.success(msg);
        if (opts?.refresh !== false) router.refresh();
        opts?.onSuccess?.(res.data);
      } else {
        setFieldErrors(res.fieldErrors ?? {});
        toast.error(res.error);
      }
      return res;
    } catch {
      toast.error('Falha de conexão. Verifique sua internet e tente novamente.');
      return { ok: false, error: 'Falha de conexão.' };
    } finally {
      setPending(false);
    }
  }, [action, opts, router]);
  return { run, pending, fieldErrors, setFieldErrors };
}

/** Lê um formulário em objeto simples. Checkboxes desmarcados viram "false" quando têm data-bool. */
export function readForm(form: HTMLFormElement) {
  const fd = new FormData(form);
  const obj: Record<string, unknown> = {};
  for (const [k, v] of fd.entries()) {
    if (k.endsWith('[]')) {
      const key = k.slice(0, -2);
      ((obj[key] as unknown[]) ??= []).push(v);
    } else obj[k] = v;
  }
  form.querySelectorAll<HTMLInputElement>('input[type=checkbox][data-bool]').forEach((cb) => { obj[cb.name] = cb.checked; });
  form.querySelectorAll<HTMLElement>('[data-array]').forEach((el) => { const n = el.getAttribute('data-array')!; obj[n] ??= []; });
  return obj;
}

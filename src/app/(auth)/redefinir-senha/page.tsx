'use client';
import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/input';
import { resetPasswordAction } from '@/lib/actions/auth';

export default function ResetPage() {
  const router = useRouter();
  const [msg, setMsg] = React.useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = React.useTransition();
  return (
    <>
      <h1 className="text-2xl font-semibold">Definir nova senha</h1>
      <form className="mt-6 space-y-4" onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        start(async () => {
          const r = await resetPasswordAction({ password: String(fd.get('password')), confirm: String(fd.get('confirm')) });
          setMsg({ ok: r.ok, text: (r.ok ? r.message : r.error) ?? '' });
          if (r.ok) setTimeout(() => router.push('/entrar'), 1200);
        });
      }}>
        <Field label="Nova senha" htmlFor="password" required hint="Mínimo de 8 caracteres, com letras e números."><Input id="password" name="password" type="password" autoComplete="new-password" required /></Field>
        <Field label="Confirme a senha" htmlFor="confirm" required><Input id="confirm" name="confirm" type="password" autoComplete="new-password" required /></Field>
        {msg && <p role="status" className={msg.ok ? 'rounded-lg bg-success-soft p-3 text-sm text-success' : 'rounded-lg bg-destructive-soft p-3 text-sm text-destructive'}>{msg.text}</p>}
        <Button type="submit" className="w-full" loading={pending}>Salvar senha</Button>
      </form>
    </>
  );
}

'use client';
import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/input';
import { resetPasswordAction } from '@/lib/actions/auth';

/** Usuário convidado (equipe ou aluno) define a senha de acesso. */
export default function InvitePage() {
  const router = useRouter();
  const [msg, setMsg] = React.useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = React.useTransition();
  return (
    <>
      <h1 className="text-2xl font-semibold">Bem-vindo(a)!</h1>
      <p className="mt-1 text-sm text-muted-foreground">Crie uma senha para acessar sua conta.</p>
      <form className="mt-6 space-y-4" onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        start(async () => {
          const r = await resetPasswordAction({ password: String(fd.get('password')), confirm: String(fd.get('confirm')) });
          setMsg({ ok: r.ok, text: (r.ok ? 'Senha criada! Redirecionando…' : r.error) ?? '' });
          if (r.ok) setTimeout(() => router.push('/entrar'), 900);
        });
      }}>
        <Field label="Senha" htmlFor="password" required hint="Mínimo de 8 caracteres, com letras e números."><Input id="password" name="password" type="password" autoComplete="new-password" required /></Field>
        <Field label="Confirme a senha" htmlFor="confirm" required><Input id="confirm" name="confirm" type="password" autoComplete="new-password" required /></Field>
        {msg && <p role="status" className={msg.ok ? 'rounded-lg bg-success-soft p-3 text-sm text-success' : 'rounded-lg bg-destructive-soft p-3 text-sm text-destructive'}>{msg.text}</p>}
        <Button type="submit" className="w-full" loading={pending}>Criar senha e entrar</Button>
      </form>
    </>
  );
}

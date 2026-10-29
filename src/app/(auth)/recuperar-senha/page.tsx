'use client';
import * as React from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/input';
import { forgotPasswordAction } from '@/lib/actions/auth';

export default function ForgotPage() {
  const [msg, setMsg] = React.useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = React.useTransition();
  return (
    <>
      <h1 className="text-2xl font-semibold">Recuperar senha</h1>
      <p className="mt-1 text-sm text-muted-foreground">Informe seu e-mail para receber o link de redefinição.</p>
      <form className="mt-6 space-y-4" onSubmit={(e) => {
        e.preventDefault();
        const email = String(new FormData(e.currentTarget).get('email'));
        start(async () => { const r = await forgotPasswordAction({ email }); setMsg({ ok: r.ok, text: (r.ok ? r.message : r.error) ?? '' }); });
      }}>
        <Field label="E-mail" htmlFor="email" required><Input id="email" name="email" type="email" required autoFocus /></Field>
        {msg && <p role="status" className={msg.ok ? 'rounded-lg bg-success-soft p-3 text-sm text-success' : 'rounded-lg bg-destructive-soft p-3 text-sm text-destructive'}>{msg.text}</p>}
        <Button type="submit" className="w-full" loading={pending}>Enviar link</Button>
      </form>
      <p className="mt-6 text-center text-sm"><Link href="/login" className="text-primary hover:underline">Voltar para o login</Link></p>
    </>
  );
}

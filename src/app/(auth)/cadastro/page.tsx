'use client';
import * as React from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Field, Input, Checkbox } from '@/components/ui/input';
import { signupAction } from '@/lib/actions/auth';

export default function SignupPage() {
  const [state, setState] = React.useState<{ error?: string; message?: string }>({});
  const [pending, start] = React.useTransition();
  if (state.message) {
    return (
      <div className="space-y-3">
        <h1 className="text-2xl font-semibold">Confirme seu e-mail</h1>
        <p className="text-sm text-muted-foreground">{state.message}</p>
        <Link href="/login" className="text-sm text-primary hover:underline">Voltar para o login</Link>
      </div>
    );
  }
  return (
    <>
      <h1 className="text-2xl font-semibold">Cadastre sua clínica</h1>
      <p className="mt-1 text-sm text-muted-foreground">Crie o acesso do proprietário. Depois, você configura a clínica em poucos passos.</p>
      <form
        className="mt-6 space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget);
          start(async () => {
            const res = await signupAction({
              full_name: fd.get('full_name'), email: fd.get('email'), password: fd.get('password'), accept: fd.get('accept') === 'on',
            });
            setState(res.ok ? { message: res.message } : { error: res.error });
          });
        }}
      >
        <Field label="Nome completo" htmlFor="full_name" required><Input id="full_name" name="full_name" autoComplete="name" required /></Field>
        <Field label="E-mail" htmlFor="email" required><Input id="email" name="email" type="email" autoComplete="email" required /></Field>
        <Field label="Senha" htmlFor="password" required hint="Mínimo de 8 caracteres, com letras e números.">
          <Input id="password" name="password" type="password" autoComplete="new-password" required minLength={8} />
        </Field>
        <Checkbox name="accept" required label={<span>Li e aceito os <Link href="/termos" className="text-primary underline" target="_blank">Termos de Uso</Link> e a <Link href="/privacidade" className="text-primary underline" target="_blank">Política de Privacidade</Link>.</span>} />
        {state.error && <p role="alert" className="rounded-lg bg-destructive-soft p-3 text-sm text-destructive">{state.error}</p>}
        <Button type="submit" className="w-full" loading={pending}>Criar conta</Button>
      </form>
      <p className="mt-6 text-center text-sm text-muted-foreground">Já tem conta? <Link href="/login" className="text-primary hover:underline">Entrar</Link></p>
    </>
  );
}

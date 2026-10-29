'use client';
import * as React from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/input';
import { loginAction } from '@/lib/actions/auth';

export function LoginForm({ next }: { next?: string }) {
  const [error, setError] = React.useState<string | null>(null);
  const [pending, start] = React.useTransition();
  const [show, setShow] = React.useState(false);
  return (
    <form
      className="mt-6 space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        setError(null);
        start(async () => {
          const res = await loginAction({ email: String(fd.get('email')), password: String(fd.get('password')), next });
          if (res && !res.ok) setError(res.error ?? 'Não foi possível entrar.');
        });
      }}
    >
      <Field label="E-mail" htmlFor="email" required>
        <Input id="email" name="email" type="email" autoComplete="email" required autoFocus />
      </Field>
      <Field label="Senha" htmlFor="password" required>
        <div className="relative">
          <Input id="password" name="password" type={show ? 'text' : 'password'} autoComplete="current-password" required className="pr-10" />
          <button type="button" onClick={() => setShow((s) => !s)} className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground" aria-label={show ? 'Ocultar senha' : 'Mostrar senha'}>
            {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
      </Field>
      {error && <p role="alert" className="rounded-lg bg-destructive-soft p-3 text-sm text-destructive">{error}</p>}
      <Button type="submit" className="w-full" loading={pending}>Entrar</Button>
    </form>
  );
}

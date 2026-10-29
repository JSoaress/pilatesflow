'use client';
import * as React from 'react';
import { KeyRound } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/input';
import { resetPasswordAction } from '@/lib/actions/auth';

export function PasswordForm() {
  const [v, setV] = React.useState({ password: '', confirm: '' });
  const [error, setError] = React.useState<string | null>(null);
  const [pending, start] = React.useTransition();
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        start(async () => {
          const r = await resetPasswordAction(v);
          if (r.ok) { setV({ password: '', confirm: '' }); toast.success(r.message ?? 'Senha alterada.'); }
          else setError(r.error ?? 'Não foi possível trocar a senha.');
        });
      }}
      className="grid gap-4 sm:grid-cols-2"
    >
      <Field label="Nova senha" htmlFor="pw-new" required>
        <Input id="pw-new" type="password" autoComplete="new-password" value={v.password} onChange={(e) => setV({ ...v, password: e.target.value })} required />
      </Field>
      <Field label="Confirmar nova senha" htmlFor="pw-confirm" required>
        <Input id="pw-confirm" type="password" autoComplete="new-password" value={v.confirm} onChange={(e) => setV({ ...v, confirm: e.target.value })} required />
      </Field>
      {error && <p role="alert" className="sm:col-span-2 rounded-lg bg-destructive-soft p-3 text-sm text-destructive">{error}</p>}
      <div className="sm:col-span-2"><Button type="submit" loading={pending}><KeyRound />Trocar senha</Button></div>
      <p className="sm:col-span-2 text-xs text-muted-foreground">Ao trocar a senha, suas outras sessões ativas são encerradas automaticamente.</p>
    </form>
  );
}

'use client';
import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Save } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/input';
import { updateProfile } from '@/lib/actions/settings';
import { maskPhone } from '@/lib/utils';

export function AccountForm({ fullName, phone, email }: { fullName: string; phone: string; email: string | null }) {
  const router = useRouter();
  const [v, setV] = React.useState({ full_name: fullName, phone });
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [pending, start] = React.useTransition();
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const r = await updateProfile(v);
          if (r.ok) { setErrors({}); toast.success('Dados salvos.'); router.refresh(); }
          else { setErrors(r.fieldErrors ?? {}); toast.error(r.error); }
        });
      }}
      className="grid gap-4 sm:grid-cols-2"
    >
      <Field label="Nome" htmlFor="acc-name" required error={errors.full_name}>
        <Input id="acc-name" value={v.full_name} onChange={(e) => setV({ ...v, full_name: e.target.value })} required aria-invalid={!!errors.full_name || undefined} />
      </Field>
      <Field label="E-mail" htmlFor="acc-email" hint="Para trocar o e-mail de login, contate o administrador.">
        <Input id="acc-email" value={email ?? ''} disabled />
      </Field>
      <Field label="Telefone" htmlFor="acc-phone" error={errors.phone}>
        <Input id="acc-phone" value={v.phone} onChange={(e) => setV({ ...v, phone: maskPhone(e.target.value) })} aria-invalid={!!errors.phone || undefined} />
      </Field>
      <div className="sm:col-span-2"><Button type="submit" loading={pending}><Save />Salvar</Button></div>
    </form>
  );
}

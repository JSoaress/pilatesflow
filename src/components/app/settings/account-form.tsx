'use client';
import * as React from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/input';
import { updateProfile } from '@/lib/actions/settings';
import { maskPhone } from '@/lib/utils';

export function AccountForm({ initial }: { initial: { full_name: string; phone: string; email: string } }) {
  const router = useRouter();
  const [v, setV] = React.useState(initial);
  const [pending, start] = React.useTransition();
  return (
    <form className="grid max-w-md gap-3" onSubmit={(e) => {
      e.preventDefault();
      start(async () => { const r = await updateProfile({ full_name: v.full_name, phone: v.phone }); if (r.ok) { toast.success('Dados salvos.'); router.refresh(); } else toast.error(r.error); });
    }}>
      <Field label="Nome" htmlFor="acc-name" required><Input id="acc-name" value={v.full_name} onChange={(e) => setV({ ...v, full_name: e.target.value })} /></Field>
      <Field label="Telefone" htmlFor="acc-phone"><Input id="acc-phone" value={v.phone} onChange={(e) => setV({ ...v, phone: maskPhone(e.target.value) })} /></Field>
      <Field label="E-mail de acesso" htmlFor="acc-email" hint="Para trocar o e-mail, peça ao administrador da clínica."><Input id="acc-email" value={v.email} disabled /></Field>
      <div><Button type="submit" loading={pending}>Salvar</Button></div>
    </form>
  );
}

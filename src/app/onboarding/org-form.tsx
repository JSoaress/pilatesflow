'use client';
import * as React from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/input';
import { maskPhone } from '@/lib/utils';
import { createOrganizationAction } from '@/lib/actions/onboarding';

export function OrgForm() {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  const [phone, setPhone] = React.useState('');
  const [wa, setWa] = React.useState('');
  return (
    <form className="grid gap-4 sm:grid-cols-2" onSubmit={(e) => {
      e.preventDefault();
      const fd = Object.fromEntries(new FormData(e.currentTarget).entries());
      start(async () => {
        const r = await createOrganizationAction(fd);
        if (!r.ok) { toast.error(r.error); return; }
        toast.success('Clínica criada!');
        router.push('/onboarding?passo=2');
        router.refresh();
      });
    }}>
      <Field label="Nome da clínica" htmlFor="name" required className="sm:col-span-2"><Input id="name" name="name" required autoFocus /></Field>
      <Field label="Razão social" htmlFor="legal_name"><Input id="legal_name" name="legal_name" /></Field>
      <Field label="CNPJ" htmlFor="cnpj"><Input id="cnpj" name="cnpj" inputMode="numeric" /></Field>
      <Field label="Telefone" htmlFor="phone"><Input id="phone" name="phone" value={phone} onChange={(e) => setPhone(maskPhone(e.target.value))} /></Field>
      <Field label="WhatsApp" htmlFor="whatsapp"><Input id="whatsapp" name="whatsapp" value={wa} onChange={(e) => setWa(maskPhone(e.target.value))} /></Field>
      <Field label="E-mail" htmlFor="email"><Input id="email" name="email" type="email" /></Field>
      <Field label="Instagram" htmlFor="instagram"><Input id="instagram" name="instagram" placeholder="@suaclinica" /></Field>
      <Field label="Site" htmlFor="website"><Input id="website" name="website" placeholder="https://" /></Field>
      <Field label="Fuso horário" htmlFor="timezone" hint="Padrão: horário de Brasília."><Input id="timezone" name="timezone" defaultValue="America/Sao_Paulo" /></Field>
      <div className="sm:col-span-2"><Button type="submit" loading={pending}>Criar clínica e continuar</Button></div>
    </form>
  );
}

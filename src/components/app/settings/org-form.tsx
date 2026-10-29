'use client';
import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Save } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Field, Input, Select } from '@/components/ui/input';
import { updateOrganizationAction } from '@/lib/actions/onboarding';
import { maskPhone } from '@/lib/utils';

const TZS = ['America/Sao_Paulo', 'America/Manaus', 'America/Cuiaba', 'America/Belem', 'America/Fortaleza', 'America/Recife', 'America/Bahia', 'America/Porto_Velho', 'America/Rio_Branco', 'America/Noronha', 'America/Campo_Grande', 'America/Boa_Vista'];

export function OrgSettingsForm({ org, readOnly }: { org: Record<string, any>; readOnly: boolean }) {
  const router = useRouter();
  const [v, setV] = React.useState<Record<string, string>>(() => Object.fromEntries(['name', 'legal_name', 'cnpj', 'email', 'phone', 'whatsapp', 'website', 'instagram', 'timezone', 'app_name', 'primary_color'].map((k) => [k, org[k] ?? ''])));
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [pending, start] = React.useTransition();
  const f = (k: string, mask?: (s: string) => string) => ({ id: `org-${k}`, value: v[k] ?? '', onChange: (e: React.ChangeEvent<HTMLInputElement>) => setV({ ...v, [k]: mask ? mask(e.target.value) : e.target.value }), 'aria-invalid': !!errors[k] || undefined });
  return (
    <form onSubmit={(e) => {
      e.preventDefault();
      start(async () => {
        const r = await updateOrganizationAction(v);
        if (r.ok) { setErrors({}); toast.success('Dados da clínica salvos.'); router.refresh(); }
        else { setErrors(r.fieldErrors ?? {}); toast.error(r.error); }
      });
    }}>
      <fieldset disabled={readOnly} className="grid gap-4 sm:grid-cols-2">
        <Field label="Nome fantasia" htmlFor="org-name" required error={errors.name}><Input {...f('name')} required /></Field>
        <Field label="Razão social" htmlFor="org-legal_name" error={errors.legal_name}><Input {...f('legal_name')} /></Field>
        <Field label="CNPJ" htmlFor="org-cnpj" error={errors.cnpj}><Input {...f('cnpj')} inputMode="numeric" /></Field>
        <Field label="E-mail" htmlFor="org-email" error={errors.email}><Input {...f('email')} type="email" /></Field>
        <Field label="Telefone" htmlFor="org-phone" error={errors.phone}><Input {...f('phone', maskPhone)} /></Field>
        <Field label="WhatsApp" htmlFor="org-whatsapp" error={errors.whatsapp}><Input {...f('whatsapp', maskPhone)} /></Field>
        <Field label="Site" htmlFor="org-website" error={errors.website}><Input {...f('website')} placeholder="https://" /></Field>
        <Field label="Instagram" htmlFor="org-instagram" error={errors.instagram}><Input {...f('instagram')} placeholder="@suaclinica" /></Field>
        <Field label="Fuso horário" htmlFor="org-timezone"><Select id="org-timezone" value={v.timezone} onChange={(e) => setV({ ...v, timezone: e.target.value })}>{TZS.map((t) => <option key={t}>{t}</option>)}</Select></Field>
        <Field label="Nome do sistema" htmlFor="org-app_name" hint="Exibido no menu e no aplicativo instalado."><Input {...f('app_name')} maxLength={40} /></Field>
        <Field label="Cor principal" htmlFor="org-primary_color" error={errors.primary_color}>
          <div className="flex gap-2"><input type="color" aria-label="Escolher cor" value={v.primary_color || '#3F6F5E'} onChange={(e) => setV({ ...v, primary_color: e.target.value })} className="h-10 w-12 cursor-pointer rounded border bg-card" /><Input {...f('primary_color')} maxLength={7} /></div>
        </Field>
        {!readOnly && <div className="sm:col-span-2"><Button type="submit" loading={pending}><Save />Salvar</Button></div>}
      </fieldset>
    </form>
  );
}

'use client';
import * as React from 'react';
import Link from 'next/link';
import { CheckCircle2 } from 'lucide-react';
import { submitLead } from '@/lib/actions/public';
import { Button } from '@/components/ui/button';
import { Checkbox, Field, Input, Select, Textarea } from '@/components/ui/input';
import { maskPhone } from '@/lib/utils';

export function LeadForm({ slug, services }: { slug: string; services: string[] }) {
  const [state, setState] = React.useState({ name: '', phone: '', email: '', interest: '', message: '', consent: false, website: '' });
  const [error, setError] = React.useState<string | null>(null);
  const [sent, setSent] = React.useState(false);
  const [pending, start] = React.useTransition();
  const set = (k: keyof typeof state) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setState((s) => ({ ...s, [k]: k === 'phone' ? maskPhone(e.target.value) : e.target.type === 'checkbox' ? (e.target as HTMLInputElement).checked : e.target.value }));

  if (sent) return (
    <div className="mt-6 flex flex-col items-center gap-3 py-8 text-center" role="status">
      <CheckCircle2 className="h-12 w-12 text-primary" />
      <p className="font-display text-xl">Mensagem enviada!</p>
      <p className="text-sm text-muted-foreground">Em breve entraremos em contato.</p>
    </div>
  );

  return (
    <form className="mt-5 space-y-4" onSubmit={(e) => {
      e.preventDefault(); setError(null);
      if (!state.consent) return setError('É necessário concordar com a Política de Privacidade.');
      start(async () => { const r = await submitLead(slug, state); if (r.ok) setSent(true); else setError(r.error); });
    }}>
      <Field label="Nome" htmlFor="lf-name" required><Input id="lf-name" autoComplete="name" value={state.name} onChange={set('name')} required /></Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="WhatsApp / telefone" htmlFor="lf-phone" required><Input id="lf-phone" inputMode="tel" autoComplete="tel" value={state.phone} onChange={set('phone')} required /></Field>
        <Field label="E-mail" htmlFor="lf-email"><Input id="lf-email" type="email" autoComplete="email" value={state.email} onChange={set('email')} /></Field>
      </div>
      <Field label="Interesse" htmlFor="lf-int">
        <Select id="lf-int" value={state.interest} onChange={set('interest')}>
          <option value="">Selecione</option>
          {services.map((s) => <option key={s}>{s}</option>)}
          <option>Outro</option>
        </Select>
      </Field>
      <Field label="Mensagem" htmlFor="lf-msg"><Textarea id="lf-msg" value={state.message} onChange={set('message')} maxLength={2000} /></Field>
      <input type="text" name="website" tabIndex={-1} autoComplete="off" value={state.website} onChange={set('website')} className="hidden" aria-hidden />
      <Checkbox checked={state.consent} onChange={set('consent')} label={<span>Concordo com a <Link href="/privacidade" className="text-primary underline" target="_blank">Política de Privacidade</Link> e autorizo o contato.</span>} />
      {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
      <Button type="submit" loading={pending} className="w-full">Enviar</Button>
    </form>
  );
}

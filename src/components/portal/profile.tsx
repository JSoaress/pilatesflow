'use client';
import * as React from 'react';
import { useRouter } from 'next/navigation';
import { LogOut } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/input';
import { portalUpdateProfile, portalChangePassword } from '@/lib/actions/portal';
import { logoutAction } from '@/lib/actions/auth';
import { maskPhone } from '@/lib/utils';

export function PortalProfileForm({ patientId, initial }: { patientId: string; initial: Record<string, string> }) {
  const router = useRouter();
  const [v, setV] = React.useState(initial);
  const [pending, setPending] = React.useState(false);
  const F = (k: string, l: string, extra?: Partial<React.InputHTMLAttributes<HTMLInputElement>>) => (
    <Field label={l} htmlFor={`pp-${k}`}><Input id={`pp-${k}`} value={v[k] ?? ''} onChange={(e) => setV({ ...v, [k]: k === 'phone' || k === 'whatsapp' ? maskPhone(e.target.value) : e.target.value })} {...extra} /></Field>
  );
  return (
    <form className="grid gap-4 sm:grid-cols-2" onSubmit={async (e) => {
      e.preventDefault();
      setPending(true);
      const r = await portalUpdateProfile(patientId, v);
      setPending(false);
      if (r.ok) { toast.success('Dados atualizados.'); router.refresh(); } else toast.error(r.error);
    }}>
      {F('social_name', 'Nome social (opcional)')}{F('email', 'E-mail', { type: 'email' })}{F('phone', 'Telefone', { type: 'tel' })}{F('whatsapp', 'WhatsApp', { type: 'tel' })}
      {F('address_zip', 'CEP')}{F('address_street', 'Logradouro')}{F('address_number', 'Número')}{F('address_complement', 'Complemento')}{F('address_district', 'Bairro')}{F('address_city', 'Cidade')}{F('address_state', 'UF', { maxLength: 2 })}
      <div className="sm:col-span-2"><Button type="submit" loading={pending}>Salvar</Button></div>
    </form>
  );
}

export function PortalPasswordForm() {
  const [p, setP] = React.useState({ a: '', b: '' });
  const [pending, setPending] = React.useState(false);
  return (
    <form className="grid max-w-md gap-3" onSubmit={async (e) => {
      e.preventDefault();
      if (p.a !== p.b) { toast.error('As senhas não conferem.'); return; }
      setPending(true);
      const r = await portalChangePassword(p.a);
      setPending(false);
      if (r.ok) { toast.success(r.message ?? 'Senha alterada.'); setP({ a: '', b: '' }); } else toast.error(r.error);
    }}>
      <Field label="Nova senha" htmlFor="np1" hint="Mínimo 8 caracteres, com letras e números."><Input id="np1" type="password" autoComplete="new-password" value={p.a} onChange={(e) => setP({ ...p, a: e.target.value })} /></Field>
      <Field label="Confirmar nova senha" htmlFor="np2"><Input id="np2" type="password" autoComplete="new-password" value={p.b} onChange={(e) => setP({ ...p, b: e.target.value })} /></Field>
      <div><Button type="submit" variant="outline" loading={pending}>Alterar senha</Button></div>
    </form>
  );
}

export function PortalLogout() {
  const [pending, start] = React.useTransition();
  return (
    <div className="flex flex-wrap gap-2">
      <Button variant="outline" loading={pending} onClick={() => start(async () => { await logoutAction('local'); })}><LogOut /> Sair</Button>
      <Button variant="ghost" onClick={() => start(async () => { await logoutAction('global'); })}>Sair de todos os dispositivos</Button>
    </div>
  );
}

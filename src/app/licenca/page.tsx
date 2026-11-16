import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Lock, MessageCircle, Mail, KeyRound } from 'lucide-react';
import { getAppContext } from '@/lib/auth/context';
import { supportContact } from '@/lib/license';
import { Button } from '@/components/ui/button';
import { date } from '@/lib/format';
import { LicenseClientActions } from '@/components/platform/license-client';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Acesso bloqueado' };

export default async function LicensePage() {
  const ctx = await getAppContext();
  if (ctx.license.ok) redirect('/app');
  const suspended = ctx.license.status === 'suspended';
  const isOwner = ctx.org.role_key === 'owner';
  const contact = supportContact();
  const wa = contact.whatsappUrl(`Olá! Quero ${ctx.license.status === 'trial' ? 'contratar' : 'liberar'} o PilatesFlow para a clínica "${ctx.org.name}".`);
  return (
    <main className="flex min-h-screen items-center justify-center bg-muted/40 p-4">
      <div className="w-full max-w-md space-y-6 rounded-2xl border bg-card p-6 shadow-sm sm:p-8">
        <div className="space-y-3 text-center">
          <div className="mx-auto flex size-14 items-center justify-center rounded-full bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-400">
            <Lock className="size-7" />
          </div>
          <h1 className="text-xl font-semibold">{suspended ? 'Acesso suspenso' : ctx.license.status === 'trial' ? 'O período de teste terminou' : 'A licença venceu'}</h1>
          <p className="text-sm text-muted-foreground">
            <strong className="text-foreground">{ctx.org.name}</strong>
            {!suspended && ctx.license.until ? ` — ${ctx.license.status === 'trial' ? 'teste encerrado em' : 'vencida em'} ${date(ctx.license.until)}.` : '.'}
          </p>
          <p className="text-sm text-muted-foreground">
            {isOwner
              ? 'Seus dados continuam guardados com segurança. Para voltar a usar o sistema, fale com o suporte e libere o acesso.'
              : 'Avise o responsável pela clínica para liberar o acesso. Os dados continuam guardados com segurança.'}
          </p>
        </div>
        {isOwner && (wa || contact.email) && (
          <div className="space-y-2">
            {wa && <a href={wa} target="_blank" rel="noopener noreferrer" className="block"><Button className="w-full"><MessageCircle /> Falar no WhatsApp</Button></a>}
            {contact.email && <a href={`mailto:${contact.email}?subject=${encodeURIComponent(`Liberação PilatesFlow — ${ctx.org.name}`)}`} className="block"><Button variant="outline" className="w-full"><Mail /> {contact.email}</Button></a>}
          </div>
        )}
        {ctx.isPlatformAdmin && (
          <Link href="/plataforma" className="block"><Button variant="secondary" className="w-full"><KeyRound /> Abrir painel da plataforma</Button></Link>
        )}
        <LicenseClientActions orgs={ctx.orgs.map((o) => ({ id: o.id, name: o.name }))} orgId={ctx.org.id} />
      </div>
    </main>
  );
}

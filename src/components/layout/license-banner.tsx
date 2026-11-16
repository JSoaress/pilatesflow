import { Clock, MessageCircle, ShieldCheck } from 'lucide-react';
import type { LicenseInfo } from '@/lib/auth/context';
import { daysLeft, supportContact } from '@/lib/license';
import { cn } from '@/lib/utils';

/** Faixa no topo: dias restantes do teste ou aviso de vencimento da licença. */
export function LicenseBanner({ license, orgName, isOwner }: { license: LicenseInfo; orgName: string; isOwner: boolean }) {
  const left = daysLeft(license.until);
  if (!license.ok || left === null) return null;
  if (license.status === 'active' && left > 7) return null;
  const urgent = left <= 2;
  const contact = supportContact();
  const wa = contact.whatsappUrl(`Olá! Quero ${license.status === 'trial' ? 'contratar' : 'renovar'} o PilatesFlow para a clínica "${orgName}".`);
  const msg = license.status === 'trial'
    ? left <= 1 ? 'Último dia do período de teste' : `Período de teste: faltam ${left} dias`
    : left <= 1 ? 'A licença vence hoje' : `A licença vence em ${left} dias`;
  return (
    <div role="status" className={cn('flex flex-wrap items-center justify-center gap-x-3 gap-y-1 px-4 py-2 text-center text-sm',
      urgent ? 'bg-amber-500 text-amber-950' : 'bg-primary/10 text-foreground')}>
      {license.status === 'trial' ? <Clock className="size-4 shrink-0" /> : <ShieldCheck className="size-4 shrink-0" />}
      <span className="font-medium">{msg}.</span>
      {isOwner && <span className="hidden sm:inline">Depois disso o acesso é bloqueado até a liberação.</span>}
      {isOwner && wa && (
        <a href={wa} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-semibold underline underline-offset-2">
          <MessageCircle className="size-4" /> {license.status === 'trial' ? 'Contratar' : 'Renovar'}
        </a>
      )}
    </div>
  );
}

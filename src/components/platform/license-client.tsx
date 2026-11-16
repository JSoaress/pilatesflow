'use client';
import * as React from 'react';
import { useRouter } from 'next/navigation';
import { LogOut, Building2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { switchOrg } from '@/lib/actions/shell';
import { logoutAction } from '@/lib/actions/auth';

export function LicenseClientActions({ orgs, orgId }: { orgs: { id: string; name: string }[]; orgId: string }) {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  const others = orgs.filter((o) => o.id !== orgId);
  return (
    <div className="space-y-3">
      {others.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Entrar em outra clínica</p>
          {others.map((o) => (
            <Button key={o.id} variant="outline" className="w-full justify-start" disabled={pending}
              onClick={() => start(async () => { const r = await switchOrg(o.id); if (r.ok) router.push('/app'); else toast.error(r.error); })}>
              <Building2 /> {o.name}
            </Button>
          ))}
        </div>
      )}
      <Button variant="ghost" className="w-full" disabled={pending} onClick={() => start(async () => { await logoutAction('local'); })}>
        <LogOut /> Sair
      </Button>
    </div>
  );
}

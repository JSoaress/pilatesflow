'use client';
import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Menu as MenuIcon, Building2, ChevronDown, LogOut, UserRound, ShieldCheck, Check, MonitorSmartphone, KeyRound } from 'lucide-react';
import { toast } from 'sonner';
import { Menu, MenuItem, MenuLink } from '@/components/ui/menu';
import { Avatar } from '@/components/ui/misc';
import { Button } from '@/components/ui/button';
import { switchOrg, switchUnit } from '@/lib/actions/shell';
import { logoutAction } from '@/lib/actions/auth';
import { GlobalSearch } from './global-search';
import { NotificationsBell } from './notifications-bell';
import { ThemeToggle } from './theme-toggle';
import { MobileNav, type NavItem } from './sidebar';

type Props = {
  items: NavItem[];
  appName: string;
  user: { name: string; email: string | null; role: string };
  orgs: { id: string; name: string }[];
  orgId: string;
  units: { id: string; name: string }[];
  unitId: string | null;
  allUnits: boolean;
  isPlatformAdmin?: boolean;
};

export function Topbar({ items, appName, user, orgs, orgId, units, unitId, allUnits, isPlatformAdmin }: Props) {
  const router = useRouter();
  const [mobile, setMobile] = React.useState(false);
  const [pending, start] = React.useTransition();
  const currentUnit = units.find((u) => u.id === unitId);
  const changeUnit = (id: string) => start(async () => {
    const r = await switchUnit(id);
    if (!r.ok) toast.error(r.error); else router.refresh();
  });
  return (
    <header className="no-print sticky top-0 z-20 flex h-16 items-center gap-2 border-b bg-background/85 px-3 backdrop-blur sm:px-5">
      <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setMobile(true)} aria-label="Abrir menu"><MenuIcon /></Button>
      <MobileNav items={items} appName={appName} open={mobile} onClose={() => setMobile(false)} />
      <div className="min-w-0 flex-1"><GlobalSearch /></div>

      {(units.length > 1 || allUnits) && units.length > 0 && (
        <Menu trigger={(p) => (
          <Button variant="outline" size="sm" className="hidden max-w-[220px] sm:inline-flex" disabled={pending} {...p}>
            <Building2 /> <span className="truncate">{currentUnit?.name ?? 'Todas as unidades'}</span> <ChevronDown className="opacity-60" />
          </Button>
        )}>
          {(close) => (
            <>
              <p className="px-3 pb-1 pt-2 text-xs font-medium text-muted-foreground">Unidade atual</p>
              {allUnits && (
                <MenuItem onClick={() => { close(); changeUnit('all'); }}>
                  {unitId === null ? <Check /> : <span className="w-4" />} Todas (consolidado)
                </MenuItem>
              )}
              {units.map((u) => (
                <MenuItem key={u.id} onClick={() => { close(); changeUnit(u.id); }}>
                  {unitId === u.id ? <Check /> : <span className="w-4" />} {u.name}
                </MenuItem>
              ))}
            </>
          )}
        </Menu>
      )}

      <NotificationsBell />
      <ThemeToggle />

      <Menu trigger={(p) => (
        <button className="flex items-center gap-2 rounded-full p-0.5 pr-2 hover:bg-muted" aria-label="Menu do usuário" {...p}>
          <Avatar name={user.name} size={34} />
          <ChevronDown className="hidden h-4 w-4 text-muted-foreground sm:block" />
        </button>
      )}>
        {(close) => (
          <>
            <div className="border-b px-3 pb-2 pt-1.5">
              <p className="truncate text-sm font-medium">{user.name}</p>
              <p className="truncate text-xs text-muted-foreground">{user.email}</p>
              <p className="mt-0.5 text-xs text-primary">{user.role}</p>
            </div>
            {orgs.length > 1 && (
              <div className="border-b py-1">
                <p className="px-3 py-1 text-xs text-muted-foreground">Clínica</p>
                {orgs.map((o) => (
                  <MenuItem key={o.id} onClick={() => { close(); start(async () => { await switchOrg(o.id); router.refresh(); }); }}>
                    {o.id === orgId ? <Check /> : <span className="w-4" />} {o.name}
                  </MenuItem>
                ))}
              </div>
            )}
            <MenuLink href="/app/configuracoes/conta" onClick={close}><UserRound /> Minha conta</MenuLink>
            {isPlatformAdmin && <MenuLink href="/plataforma" onClick={close}><KeyRound /> Painel da plataforma</MenuLink>}
            <MenuLink href="/app/checkin" onClick={close}><MonitorSmartphone /> Modo check-in</MenuLink>
            <MenuLink href="/privacidade" onClick={close}><ShieldCheck /> Privacidade</MenuLink>
            <MenuItem destructive onClick={() => { close(); start(async () => { await logoutAction('local'); }); }}><LogOut /> Sair</MenuItem>
          </>
        )}
      </Menu>
    </header>
  );
}

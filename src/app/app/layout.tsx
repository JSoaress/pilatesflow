import { redirect } from 'next/navigation';
import { getAppContext } from '@/lib/auth/context';
import { NAV } from '@/lib/permissions';
import { Sidebar } from '@/components/layout/sidebar';
import { Topbar } from '@/components/layout/topbar';
import { LicenseBanner } from '@/components/layout/license-banner';

export const dynamic = 'force-dynamic';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const ctx = await getAppContext();
  if (!ctx.license.ok) redirect('/licenca');
  if (!ctx.org.onboarding_completed_at && ctx.org.role_key === 'owner') redirect('/onboarding');
  const items = NAV.filter((n) => ctx.can(n.perm) || (n.href === '/app/configuracoes' && (ctx.can('users.view') || ctx.can('audit.view') || ctx.can('lgpd.view'))))
    .map(({ href, label, icon }) => ({ href, label, icon }));
  return (
    <div className="min-h-screen">
      <Sidebar items={items} appName={ctx.org.app_name || 'PilatesFlow'} orgName={ctx.org.name} />
      <div className="lg:pl-64">
        <LicenseBanner license={ctx.license} orgName={ctx.org.name} isOwner={ctx.org.role_key === 'owner'} />
        <Topbar
          items={items}
          appName={ctx.org.app_name || 'PilatesFlow'}
          user={{ name: ctx.profile?.full_name ?? ctx.user.email ?? 'Usuário', email: ctx.user.email, role: ctx.org.role_name }}
          orgs={ctx.orgs.map((o) => ({ id: o.id, name: o.name }))}
          orgId={ctx.org.id}
          units={ctx.units}
          unitId={ctx.unitId}
          allUnits={ctx.org.all_units}
          isPlatformAdmin={ctx.isPlatformAdmin}
        />
        <main id="conteudo" className="mx-auto w-full max-w-[1400px] px-4 py-6 sm:px-6 lg:px-8">{children}</main>
      </div>
    </div>
  );
}

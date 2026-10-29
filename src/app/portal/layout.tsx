import Link from 'next/link';
import { Home, CalendarDays, CalendarPlus, Wallet, FileText, UserRound } from 'lucide-react';
import { getPortalContext } from '@/lib/auth/portal';
import { Logo } from '@/components/layout/sidebar';
import { ThemeToggle } from '@/components/layout/theme-toggle';
import { InstallButton } from '@/components/layout/install-button';
import { PortalNav } from './portal-nav';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Portal do aluno', robots: { index: false } };

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const { me } = await getPortalContext();
  const items = [
    { href: '/portal', label: 'Início', icon: <Home className="h-5 w-5" /> },
    { href: '/portal/aulas', label: 'Minhas aulas', icon: <CalendarDays className="h-5 w-5" /> },
    { href: '/portal/agendar', label: 'Agendar', icon: <CalendarPlus className="h-5 w-5" /> },
    { href: '/portal/financeiro', label: 'Financeiro', icon: <Wallet className="h-5 w-5" /> },
    { href: '/portal/documentos', label: 'Documentos', icon: <FileText className="h-5 w-5" /> },
    { href: '/portal/perfil', label: 'Perfil', icon: <UserRound className="h-5 w-5" /> },
  ];
  return (
    <div className="min-h-screen pb-20 md:pb-0">
      <header className="sticky top-0 z-20 border-b bg-background/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between gap-3 px-4">
          <Link href="/portal" className="flex items-center gap-2"><Logo /><span className="font-display text-lg">{me.organization_name}</span></Link>
          <div className="flex items-center gap-1"><InstallButton compact /><ThemeToggle /></div>
        </div>
        <PortalNav items={items} variant="top" />
      </header>
      <main className="mx-auto max-w-5xl px-4 py-6">{children}</main>
      <PortalNav items={items} variant="bottom" />
    </div>
  );
}

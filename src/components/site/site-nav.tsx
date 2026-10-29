'use client';
import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Menu as MenuIcon, X, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Menu } from '@/components/ui/menu';
import { cn } from '@/lib/utils';

// Agrupado em menus por tema: com os 10 links soltos, o cabeçalho quebrava
// em telas médias (o nome da clínica tinha que dividir espaço com tudo isso).
const NAV_GROUPS = [
  { label: 'Conheça', links: [['/sobre', 'Sobre'], ['/pilates', 'Pilates'], ['/modalidades', 'Modalidades'], ['/equipe', 'Equipe'], ['/estrutura', 'Estrutura']] },
  { label: 'Conteúdo', links: [['/depoimentos', 'Depoimentos'], ['/perguntas-frequentes', 'Dúvidas'], ['/blog', 'Blog']] },
] as const;
const NAV_LINKS = [['/planos', 'Planos'], ['/contato', 'Contato']] as const;

const isGroupActive = (links: readonly (readonly string[])[], pathname: string) => links.some(([href]) => href === pathname);

export function SiteNav({ cta }: { cta: string }) {
  const [open, setOpen] = React.useState(false);
  const pathname = usePathname();
  React.useEffect(() => setOpen(false), [pathname]);
  return (
    <>
      <nav aria-label="Principal" className="hidden items-center gap-1 xl:flex">
        {NAV_GROUPS.map((g) => (
          <Menu
            key={g.label}
            align="start"
            trigger={(p) => (
              <button {...p} className={cn('flex items-center gap-1 rounded-md px-2.5 py-1.5 text-sm hover:bg-muted', isGroupActive(g.links, pathname) && 'text-primary')}>
                {g.label}<ChevronDown className="h-3.5 w-3.5" />
              </button>
            )}
          >
            {(close) => g.links.map(([href, l]) => (
              <Link key={href} href={href} onClick={close} className={cn('block rounded-lg px-3 py-2 text-sm hover:bg-muted', pathname === href && 'text-primary')}>{l}</Link>
            ))}
          </Menu>
        ))}
        {NAV_LINKS.map(([href, l]) => <Link key={href} href={href} className={cn('rounded-md px-2.5 py-1.5 text-sm hover:bg-muted', pathname === href && 'text-primary')}>{l}</Link>)}
      </nav>
      <div className="flex items-center gap-2">
        <Link href="/login" className="hidden sm:block"><Button variant="outline">Entrar</Button></Link>
        <Link href="/agendar" className="hidden sm:block"><Button>{cta}</Button></Link>
        <Button variant="ghost" size="icon" className="xl:hidden" onClick={() => setOpen(!open)} aria-expanded={open} aria-label="Menu">{open ? <X /> : <MenuIcon />}</Button>
      </div>
      {open && (
        <nav aria-label="Principal" className="absolute inset-x-0 top-16 max-h-[calc(100vh-4rem)] overflow-y-auto border-b bg-background p-4 shadow-lift xl:hidden">
          <div className="grid gap-1">
            {NAV_GROUPS.map((g) => (
              <div key={g.label} className="pt-2 first:pt-0">
                <p className="px-3 pb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">{g.label}</p>
                {g.links.map(([href, l]) => <Link key={href} href={href} className="block rounded-md px-3 py-2 hover:bg-muted">{l}</Link>)}
              </div>
            ))}
            <div className="pt-2">
              {NAV_LINKS.map(([href, l]) => <Link key={href} href={href} className="block rounded-md px-3 py-2 hover:bg-muted">{l}</Link>)}
            </div>
            <Link href="/login" className="mt-2"><Button variant="outline" className="w-full">Entrar</Button></Link>
            <Link href="/agendar" className="mt-2"><Button className="w-full">{cta}</Button></Link>
          </div>
        </nav>
      )}
    </>
  );
}

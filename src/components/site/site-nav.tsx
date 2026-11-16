'use client';
import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Menu, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const LINKS = [
  ['/sobre', 'Sobre'], ['/pilates', 'Pilates'], ['/modalidades', 'Modalidades'], ['/equipe', 'Equipe'], ['/planos', 'Planos'],
  ['/estrutura', 'Estrutura'], ['/depoimentos', 'Depoimentos'], ['/perguntas-frequentes', 'Dúvidas'], ['/blog', 'Blog'], ['/contato', 'Contato'],
] as const;

export function SiteNav({ cta }: { cta: string }) {
  const [open, setOpen] = React.useState(false);
  const pathname = usePathname();
  React.useEffect(() => setOpen(false), [pathname]);
  return (
    <>
      <nav aria-label="Principal" className="hidden items-center gap-1 xl:flex">
        {LINKS.map(([href, l]) => <Link key={href} href={href} className={cn('rounded-md px-2.5 py-1.5 text-sm hover:bg-muted', pathname === href && 'text-primary')}>{l}</Link>)}
      </nav>
      <div className="flex items-center gap-2">
        <Link href="/agendar" className="hidden sm:block"><Button>{cta}</Button></Link>
        <Button variant="ghost" size="icon" className="xl:hidden" onClick={() => setOpen(!open)} aria-expanded={open} aria-label="Menu">{open ? <X /> : <Menu />}</Button>
      </div>
      {open && (
        <nav aria-label="Principal" className="absolute inset-x-0 top-16 border-b bg-background p-4 shadow-lift xl:hidden">
          <div className="grid gap-1">
            {LINKS.map(([href, l]) => <Link key={href} href={href} className="rounded-md px-3 py-2 hover:bg-muted">{l}</Link>)}
            <Link href="/agendar" className="mt-2"><Button className="w-full">{cta}</Button></Link>
          </div>
        </nav>
      )}
    </>
  );
}

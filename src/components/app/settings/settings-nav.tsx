'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';

export function SettingsNav({ items }: { items: { href: string; label: string }[] }) {
  const pathname = usePathname();
  if (pathname === '/app/configuracoes') return null;
  return (
    <nav aria-label="Configurações" className="mb-6 flex gap-1 overflow-x-auto border-b scrollbar-thin">
      <Link href="/app/configuracoes" className="-mb-px whitespace-nowrap border-b-2 border-transparent px-3 py-2.5 text-sm text-muted-foreground hover:text-foreground">← Todas</Link>
      {items.map((i) => {
        const active = pathname.startsWith(i.href);
        return <Link key={i.href} href={i.href} aria-current={active ? 'page' : undefined} className={cn('-mb-px whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-medium', active ? 'border-primary' : 'border-transparent text-muted-foreground hover:text-foreground')}>{i.label}</Link>;
      })}
    </nav>
  );
}

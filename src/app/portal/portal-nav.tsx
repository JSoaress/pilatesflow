'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';

export function PortalNav({ items, variant }: { items: { href: string; label: string; icon: React.ReactNode }[]; variant: 'top' | 'bottom' }) {
  const pathname = usePathname();
  const isActive = (h: string) => (h === '/portal' ? pathname === h : pathname.startsWith(h));
  if (variant === 'top') {
    return (
      <nav aria-label="Portal" className="mx-auto hidden max-w-5xl gap-1 px-4 md:flex">
        {items.map((i) => <Link key={i.href} href={i.href} aria-current={isActive(i.href) ? 'page' : undefined} className={cn('-mb-px border-b-2 px-3 py-2.5 text-sm font-medium', isActive(i.href) ? 'border-primary' : 'border-transparent text-muted-foreground hover:text-foreground')}>{i.label}</Link>)}
      </nav>
    );
  }
  return (
    <nav aria-label="Portal" className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-6 border-t bg-card md:hidden">
      {items.map((i) => (
        <Link key={i.href} href={i.href} aria-current={isActive(i.href) ? 'page' : undefined} className={cn('flex flex-col items-center gap-0.5 py-2 text-[10px]', isActive(i.href) ? 'text-primary' : 'text-muted-foreground')}>
          {i.icon}{i.label}
        </Link>
      ))}
    </nav>
  );
}

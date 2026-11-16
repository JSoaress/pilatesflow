'use client';
import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { NAV_ICONS } from './icons';
import { InstallButton } from './install-button';

export type NavItem = { href: string; label: string; icon: string };

function NavLinks({ items, onNavigate }: { items: NavItem[]; onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Menu principal" className="flex-1 space-y-0.5 overflow-y-auto px-3 py-2 scrollbar-thin">
      {items.map((it) => {
        const Icon = NAV_ICONS[it.icon];
        const active = it.href === '/app' ? pathname === '/app' : pathname === it.href || pathname.startsWith(it.href + '/');
        return (
          <Link key={it.href} href={it.href} onClick={onNavigate} aria-current={active ? 'page' : undefined}
            className={cn('flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
              active ? 'bg-sidebar-active text-primary' : 'text-sidebar-foreground hover:bg-muted')}>
            {Icon && <Icon className="h-[18px] w-[18px] shrink-0" aria-hidden />}
            {it.label}
          </Link>
        );
      })}
    </nav>
  );
}

export function Sidebar({ items, appName, orgName }: { items: NavItem[]; appName: string; orgName: string }) {
  return (
    <aside className="no-print fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r bg-sidebar lg:flex">
      <div className="flex h-16 items-center gap-2.5 border-b px-5">
        <Logo />
        <div className="min-w-0">
          <p className="truncate font-display text-lg leading-tight">{appName}</p>
          <p className="truncate text-xs text-muted-foreground">{orgName}</p>
        </div>
      </div>
      <NavLinks items={items} />
      <div className="border-t p-3"><InstallButton compact className="w-full" /></div>
    </aside>
  );
}

export function MobileNav({ items, appName, open, onClose }: { items: NavItem[]; appName: string; open: boolean; onClose: () => void }) {
  React.useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [open]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Menu">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="absolute inset-y-0 left-0 flex w-72 max-w-[85vw] animate-fade-in flex-col bg-sidebar shadow-lift">
        <div className="flex h-16 items-center justify-between border-b px-5">
          <span className="flex items-center gap-2 font-display text-lg"><Logo />{appName}</span>
          <button onClick={onClose} className="rounded-md p-2 hover:bg-muted" aria-label="Fechar menu"><X className="h-5 w-5" /></button>
        </div>
        <NavLinks items={items} onNavigate={onClose} />
        <div className="border-t p-3"><InstallButton compact className="w-full" /></div>
      </div>
    </div>
  );
}

export function Logo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={cn('h-8 w-8 shrink-0', className)} aria-hidden>
      <rect width="32" height="32" rx="9" fill="hsl(var(--primary))" />
      <path d="M9 22c3-9 11-9 14 0" stroke="white" strokeWidth="2.2" fill="none" strokeLinecap="round" />
      <circle cx="16" cy="10.5" r="2.4" fill="white" />
    </svg>
  );
}

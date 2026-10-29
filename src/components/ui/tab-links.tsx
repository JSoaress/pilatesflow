import Link from 'next/link';
import { cn } from '@/lib/utils';

/** Abas por link (?aba=) — renderização no servidor, só a aba ativa carrega dados. */
export function TabLinks({ tabs, active, base, param = 'aba' }: { tabs: { id: string; label: string; hidden?: boolean; count?: number }[]; active: string; base: string; param?: string }) {
  return (
    <nav aria-label="Seções" className="mb-6 flex gap-1 overflow-x-auto border-b scrollbar-thin">
      {tabs.filter((t) => !t.hidden).map((t) => (
        <Link key={t.id} href={`${base}?${param}=${t.id}`} scroll={false} aria-current={active === t.id ? 'page' : undefined}
          className={cn('-mb-px whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-medium transition-colors',
            active === t.id ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground')}>
          {t.label}
          {t.count ? <span className="ml-1.5 rounded-full bg-muted px-1.5 text-xs">{t.count}</span> : null}
        </Link>
      ))}
    </nav>
  );
}

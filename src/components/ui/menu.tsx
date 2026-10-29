'use client';
import * as React from 'react';
import { cn } from '@/lib/utils';

/** Menu suspenso simples e acessível (fecha com ESC e clique fora). */
export function Menu({ trigger, children, align = 'end', className }: { trigger: (props: { onClick: () => void; 'aria-expanded': boolean; 'aria-haspopup': 'menu' }) => React.ReactNode; children: (close: () => void) => React.ReactNode; align?: 'start' | 'end'; className?: string }) {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDoc); document.removeEventListener('keydown', onKey); };
  }, [open]);
  return (
    <div ref={ref} className="relative inline-block">
      {trigger({ onClick: () => setOpen((o) => !o), 'aria-expanded': open, 'aria-haspopup': 'menu' })}
      {open && (
        <div role="menu" className={cn('absolute z-50 mt-1 min-w-[200px] animate-fade-in rounded-xl border bg-card p-1 shadow-lift', align === 'end' ? 'right-0' : 'left-0', className)}>
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  );
}

export function MenuItem({ className, destructive, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { destructive?: boolean }) {
  return (
    <button role="menuitem" type="button" className={cn('flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-muted disabled:opacity-50 [&_svg]:h-4 [&_svg]:w-4', destructive && 'text-destructive', className)} {...props} />
  );
}

export function MenuLink({ href, className, children, onClick }: { href: string; className?: string; children: React.ReactNode; onClick?: () => void }) {
  return (
    <a href={href} onClick={onClick} role="menuitem" className={cn('flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-muted [&_svg]:h-4 [&_svg]:w-4', className)}>
      {children}
    </a>
  );
}

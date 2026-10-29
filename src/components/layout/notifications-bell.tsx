'use client';
import * as React from 'react';
import Link from 'next/link';
import { Bell, CheckCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { listNotifications, markNotificationsRead, type NotificationItem } from '@/lib/actions/shell';
import { relative } from '@/lib/format';
import { cn } from '@/lib/utils';

/** Sino de notificações internas com contagem de não lidas (atualiza a cada minuto). */
export function NotificationsBell() {
  const [open, setOpen] = React.useState(false);
  const [items, setItems] = React.useState<NotificationItem[]>([]);
  const [unread, setUnread] = React.useState(0);
  const ref = React.useRef<HTMLDivElement>(null);

  const load = React.useCallback(async () => {
    const r = await listNotifications(15);
    if (r.ok && r.data) { setItems(r.data.items); setUnread(r.data.unread); }
  }, []);

  React.useEffect(() => {
    load();
    const t = setInterval(() => { if (document.visibilityState === 'visible') load(); }, 60_000);
    const onDoc = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    return () => { clearInterval(t); document.removeEventListener('mousedown', onDoc); };
  }, [load]);

  const markAll = async () => { await markNotificationsRead(); await load(); };
  const markOne = async (id: string) => { await markNotificationsRead([id]); await load(); };

  return (
    <div ref={ref} className="relative">
      <Button variant="ghost" size="icon" onClick={() => { setOpen((o) => !o); if (!open) load(); }} aria-label={`Notificações${unread ? ` (${unread} não lidas)` : ''}`} aria-expanded={open}>
        <Bell />
        {unread > 0 && <span className="absolute right-1.5 top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold text-white">{unread > 99 ? '99+' : unread}</span>}
      </Button>
      {open && (
        <div className="absolute right-0 z-50 mt-1 w-[min(380px,92vw)] animate-fade-in rounded-xl border bg-card shadow-lift">
          <div className="flex items-center justify-between border-b px-4 py-2.5">
            <p className="text-sm font-semibold">Notificações</p>
            {unread > 0 && <button onClick={markAll} className="flex items-center gap-1 text-xs text-primary hover:underline"><CheckCheck className="h-3.5 w-3.5" /> Marcar todas como lidas</button>}
          </div>
          <ul className="max-h-[60vh] overflow-y-auto scrollbar-thin">
            {items.length === 0 && <li className="px-4 py-8 text-center text-sm text-muted-foreground">Nenhuma notificação.</li>}
            {items.map((n) => (
              <li key={n.id} className={cn('border-b last:border-0', !n.read_at && 'bg-primary-soft/40')}>
                <Link href={n.link ?? '/app/notificacoes'} onClick={() => { setOpen(false); if (!n.read_at) markOne(n.id); }} className="block px-4 py-3 hover:bg-muted/60">
                  <p className="text-sm font-medium">{n.title}</p>
                  {n.body && <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{n.body}</p>}
                  <p className="mt-1 text-[11px] text-muted-foreground">{relative(n.created_at)}</p>
                </Link>
              </li>
            ))}
          </ul>
          <Link href="/app/notificacoes" onClick={() => setOpen(false)} className="block border-t px-4 py-2.5 text-center text-sm text-primary hover:bg-muted/50">Ver todas</Link>
        </div>
      )}
    </div>
  );
}

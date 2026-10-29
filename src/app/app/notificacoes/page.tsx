import Link from 'next/link';
import { Bell } from 'lucide-react';
import { getAppContext } from '@/lib/auth/context';
import { PageHeader, EmptyState } from '@/components/ui/misc';
import { MarkAllRead } from '@/components/app/comm/mark-read';
import { dateTime } from '@/lib/format';
import { cn } from '@/lib/utils';

export const metadata = { title: 'Notificações' };

export default async function NotificationsPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const ctx = await getAppContext();
  const sp = await searchParams;
  let q = ctx.supabase.from('notifications').select('id, type, title, body, link, read_at, created_at').eq('organization_id', ctx.org.id);
  if (sp.filtro === 'nao-lidas') q = q.is('read_at', null);
  if (sp.filtro === 'lidas') q = q.not('read_at', 'is', null);
  const { data } = await q.order('created_at', { ascending: false }).limit(200);
  const rows = (data ?? []) as any[];
  return (
    <>
      <PageHeader title="Notificações" actions={<MarkAllRead />} />
      <div className="mb-4 flex gap-2 text-sm">
        {[['', 'Todas'], ['nao-lidas', 'Não lidas'], ['lidas', 'Lidas']].map(([k, l]) => (
          <Link key={k} href={`/app/notificacoes${k ? `?filtro=${k}` : ''}`} className={cn('rounded-full border px-3 py-1', (sp.filtro ?? '') === k ? 'border-primary bg-primary-soft text-primary' : 'hover:bg-muted')}>{l}</Link>
        ))}
      </div>
      {rows.length === 0 ? <EmptyState icon={Bell} title="Nenhuma notificação" /> : (
        <ul className="divide-y rounded-xl border bg-card shadow-soft">
          {rows.map((n) => (
            <li key={n.id} className={cn('px-5 py-3', !n.read_at && 'bg-primary-soft/30')}>
              <Link href={n.link ?? '#'} className="block">
                <p className="font-medium">{n.title}{!n.read_at && <span className="ml-2 inline-block h-2 w-2 rounded-full bg-primary" aria-label="não lida" />}</p>
                {n.body && <p className="text-sm text-muted-foreground">{n.body}</p>}
                <p className="mt-0.5 text-xs text-muted-foreground">{dateTime(n.created_at, ctx.tz)}</p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

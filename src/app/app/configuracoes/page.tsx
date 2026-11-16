import Link from 'next/link';
import { Building2, MapPin, DoorOpen, Layers, SlidersHorizontal, FileText, Users, ShieldCheck, Plug, Globe, Lock, History, DatabaseBackup, UserCog, Settings } from 'lucide-react';

const ICONS: Record<string, React.ElementType> = { Building2, MapPin, DoorOpen, Layers, SlidersHorizontal, FileText, Users, ShieldCheck, Plug, Globe, Lock, History, DatabaseBackup, UserCog };
import { getAppContext } from '@/lib/auth/context';
import { SETTINGS_SECTIONS } from '@/lib/settings-nav';
import { PageHeader } from '@/components/ui/misc';
import { cn } from '@/lib/utils';

export const metadata = { title: 'Configurações' };

export default async function SettingsHub() {
  const ctx = await getAppContext();
  const items = SETTINGS_SECTIONS.filter((s) => !s.perm || ctx.can(s.perm));
  return (
    <>
      <PageHeader title="Configurações" description={ctx.org.name} />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {items.map((s) => {
          const Icon = ICONS[s.icon] ?? Settings;
          const card = (
            <>
              <span className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-lg', s.implemented ? 'bg-primary-soft text-primary' : 'bg-muted text-muted-foreground')}><Icon className="h-5 w-5" /></span>
              <span>
                <span className={cn('flex items-center gap-2 font-medium', s.implemented && 'group-hover:text-primary')}>
                  {s.label}
                  {!s.implemented && <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-normal text-muted-foreground">Em breve</span>}
                </span>
                <span className="text-sm text-muted-foreground">{s.desc}</span>
              </span>
            </>
          );
          return s.implemented ? (
            <Link key={s.href} href={s.href} className="group flex gap-4 rounded-xl border bg-card p-5 shadow-soft transition-shadow hover:shadow-lift">
              {card}
            </Link>
          ) : (
            <div key={s.href} className="flex cursor-not-allowed gap-4 rounded-xl border bg-card p-5 opacity-60" aria-disabled="true" title="Em desenvolvimento">
              {card}
            </div>
          );
        })}
      </div>
    </>
  );
}

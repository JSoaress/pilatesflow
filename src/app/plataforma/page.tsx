import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ArrowLeft, Building2, Clock, ShieldCheck, Ban, AlertTriangle } from 'lucide-react';
import { getUser } from '@/lib/auth/context';
import { PlatformTable, type PlatformOrg } from '@/components/platform/platform-table';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Painel da plataforma' };

export default async function PlatformPage() {
  const { supabase, user } = await getUser();
  if (!user) redirect('/login?next=/plataforma');
  const { data: isAdmin } = await supabase.rpc('is_platform_admin');
  if (!isAdmin) redirect('/app');
  const { data, error } = await supabase.rpc('platform_orgs');
  const orgs = ((data ?? []) as PlatformOrg[]).filter((o) => !o.deleted);
  const count = (f: (o: PlatformOrg) => boolean) => orgs.filter(f).length;
  const stats = [
    { label: 'Clínicas', value: orgs.length, icon: Building2, tone: 'text-foreground' },
    { label: 'Em teste', value: count((o) => o.license.status === 'trial' && o.license.ok), icon: Clock, tone: 'text-sky-600' },
    { label: 'Ativas', value: count((o) => o.license.status === 'active' && o.license.ok), icon: ShieldCheck, tone: 'text-emerald-600' },
    { label: 'Vencidas', value: count((o) => o.license.status !== 'suspended' && !o.license.ok), icon: AlertTriangle, tone: 'text-amber-600' },
    { label: 'Suspensas', value: count((o) => o.license.status === 'suspended'), icon: Ban, tone: 'text-red-600' },
  ];
  return (
    <main className="mx-auto w-full max-w-[1400px] space-y-6 px-4 py-6 sm:px-6 lg:px-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Link href="/app" className="mb-2 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" /> Voltar ao sistema</Link>
          <h1 className="text-2xl font-semibold tracking-tight">Painel da plataforma</h1>
          <p className="text-sm text-muted-foreground">Controle de acesso das clínicas: teste de 7 dias, liberação, renovação e bloqueio. Só você vê esta página.</p>
        </div>
      </div>
      {error ? (
        <p className="rounded-xl border border-destructive/40 bg-destructive/5 p-4 text-sm">Não foi possível carregar as clínicas: {error.message}</p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {stats.map((s) => (
              <div key={s.label} className="rounded-xl border bg-card p-4">
                <div className="flex items-center justify-between text-sm text-muted-foreground">{s.label}<s.icon className={`size-4 ${s.tone}`} /></div>
                <p className="mt-1 text-2xl font-semibold tabular-nums">{s.value}</p>
              </div>
            ))}
          </div>
          <PlatformTable orgs={orgs} />
        </>
      )}
    </main>
  );
}

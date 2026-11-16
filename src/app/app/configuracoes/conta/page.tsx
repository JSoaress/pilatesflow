import { getAppContext } from '@/lib/auth/context';
import { PageHeader, Section } from '@/components/ui/misc';
import { AccountForm } from '@/components/app/settings/account-form';
import { PortalPasswordForm, PortalLogout } from '@/components/portal/profile';

export const metadata = { title: 'Minha conta' };

export default async function AccountPage() {
  const ctx = await getAppContext();
  const { data: p } = await ctx.supabase.from('profiles').select('full_name, phone, email').eq('id', ctx.user.id).single();
  return (
    <>
      <PageHeader title="Minha conta" description={`${ctx.org.role_name} · ${ctx.org.name}`} />
      <div className="grid gap-6 xl:grid-cols-2">
        <Section title="Seus dados"><AccountForm initial={{ full_name: p?.full_name ?? '', phone: p?.phone ?? '', email: p?.email ?? ctx.user.email ?? '' }} /></Section>
        <div className="space-y-6">
          <Section title="Senha"><PortalPasswordForm /></Section>
          <Section title="Sessões" description="Se perdeu um aparelho ou usou um computador compartilhado, saia de todos os dispositivos."><PortalLogout /></Section>
        </div>
      </div>
    </>
  );
}

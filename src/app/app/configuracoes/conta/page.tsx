import { getAppContext } from '@/lib/auth/context';
import { PageHeader, Section, ErrorState } from '@/components/ui/misc';
import { AccountForm } from '@/components/app/settings/account-form';
import { PasswordForm } from '@/components/app/settings/password-form';
import { SessionsSection } from '@/components/app/settings/sessions-section';

export const metadata = { title: 'Minha conta' };

export default async function AccountPage() {
  const ctx = await getAppContext();
  const { data: profile, error } = await ctx.supabase.from('profiles').select('full_name, phone').eq('id', ctx.user.id).maybeSingle();
  if (error) return <ErrorState />;
  return (
    <>
      <PageHeader title="Minha conta" description="Seus dados, senha e sessões." />
      <div className="grid gap-6">
        <Section title="Dados pessoais"><AccountForm fullName={profile?.full_name ?? ''} phone={profile?.phone ?? ''} email={ctx.user.email} /></Section>
        <Section title="Senha"><PasswordForm /></Section>
        <Section title="Sessões"><SessionsSection /></Section>
      </div>
    </>
  );
}

import { requirePermission } from '@/lib/auth/context';
import { PageHeader, Section, ErrorState } from '@/components/ui/misc';
import { OrgSettingsForm } from '@/components/app/settings/org-form';
import { ImageUpload } from '@/components/app/settings/image-upload';
import { env } from '@/lib/env';
import { storagePublicUrl } from '@/lib/utils';

export const metadata = { title: 'Dados da clínica' };

export default async function ClinicPage() {
  const ctx = await requirePermission('settings.view');
  const { data: org, error } = await ctx.supabase.from('organizations').select('*').eq('id', ctx.org.id).single();
  if (error || !org) return <ErrorState />;
  const canEdit = ctx.can('settings.edit');
  return (
    <>
      <PageHeader title="Dados da clínica" description="Informações usadas em contratos, recibos, site e comunicações." />
      <div className="grid gap-6 xl:grid-cols-[2fr_1fr]">
        <Section title="Cadastro"><OrgSettingsForm org={org} readOnly={!canEdit} /></Section>
        <Section title="Logo" description="PNG/SVG com fundo transparente, ideal 512×512. Usada no site, recibos e no menu.">
          {canEdit ? <ImageUpload purpose="logo" label={org.logo_path ? 'Trocar logo' : 'Enviar logo'} currentUrl={storagePublicUrl(env.supabaseUrl, 'site', org.logo_path)} />
            : <p className="text-sm text-muted-foreground">Sem permissão para alterar.</p>}
        </Section>
      </div>
    </>
  );
}

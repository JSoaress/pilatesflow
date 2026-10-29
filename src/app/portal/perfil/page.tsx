import { getPortalContext } from '@/lib/auth/portal';
import { Section } from '@/components/ui/misc';
import { PortalProfileForm, PortalPasswordForm, PortalLogout } from '@/components/portal/profile';

export const metadata = { title: 'Meu perfil' };

export default async function PortalProfile() {
  const { me, user } = await getPortalContext();
  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Meu perfil</h1>
      <Section title="Dados de contato" description="Para alterar nome, CPF ou data de nascimento, fale com a recepção.">
        <PortalProfileForm patientId={me.patient_id} initial={{ social_name: me.social_name ?? '', phone: me.phone ?? '', whatsapp: me.whatsapp ?? '', email: me.email ?? '', address_zip: me.address_zip ?? '', address_street: me.address_street ?? '', address_number: me.address_number ?? '', address_complement: me.address_complement ?? '', address_district: me.address_district ?? '', address_city: me.address_city ?? '', address_state: me.address_state ?? '' }} />
      </Section>
      <Section title="Acesso" description={`Login: ${user.email}`}>
        <PortalPasswordForm />
        <div className="mt-4"><PortalLogout /></div>
      </Section>
      <p className="text-xs text-muted-foreground">Seus dados são tratados conforme a <a href="/privacidade" className="underline">Política de Privacidade</a>. Para solicitar acesso, correção ou exportação dos seus dados, fale com a clínica.</p>
    </div>
  );
}

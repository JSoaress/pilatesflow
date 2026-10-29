import { getPortalContext } from '@/lib/auth/portal';
import { PortalBooking } from '@/components/portal/booking';

export const metadata = { title: 'Agendar aula' };

export default async function PortalBookPage() {
  const { supabase, me } = await getPortalContext();
  const { data: services } = await supabase.rpc('portal_services', { p_patient_id: me.patient_id });
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Agendar aula</h1>
      <p className="text-sm text-muted-foreground">Escolha a modalidade e o dia para ver os horários com vaga. O agendamento respeita seu plano, saldo de aulas e regras da clínica.</p>
      <PortalBooking patientId={me.patient_id} services={(services ?? []) as any[]} credits={me.balance?.replacement_credits ?? 0} sessionsRemaining={me.balance?.sessions_remaining ?? null} hasPlan={!!me.balance?.subscription_id} />
    </div>
  );
}

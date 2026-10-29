import QRCode from 'qrcode';
import { getAppContext } from '@/lib/auth/context';
import { Section, KeyValue } from '@/components/ui/misc';
import { ResourceSection } from '@/components/resource/resource-page';
import { label, gender, origin, patientStatus } from '@/lib/labels';
import { date, dateTime } from '@/lib/format';
import { EditPatientButton } from './edit-patient-button';

export async function DataTab({ patient }: { patient: Record<string, any> }) {
  const ctx = await getAppContext();
  const [{ data: registeredBy }, qr] = await Promise.all([
    patient.registered_by ? ctx.supabase.from('profiles').select('full_name').eq('id', patient.registered_by).maybeSingle() : Promise.resolve({ data: null }),
    QRCode.toDataURL(`pilatesflow:checkin:${patient.checkin_token}`, { margin: 1, width: 220 }),
  ]);
  const unit = ctx.units.find((u) => u.id === patient.unit_id);
  const address = [patient.address_street, patient.address_number, patient.address_complement, patient.address_district,
    patient.address_city && `${patient.address_city}/${patient.address_state ?? ''}`, patient.address_zip].filter(Boolean).join(', ');
  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
      <div className="space-y-6">
        <Section title="Dados pessoais" actions={ctx.can('patients.edit') ? <EditPatientButton patient={patient} units={ctx.units.map((u) => ({ value: u.id, label: u.name }))} /> : undefined}>
          <KeyValue cols={3} items={[
            { label: 'Nome completo', value: patient.full_name },
            { label: 'Nome social', value: patient.social_name },
            { label: 'Data de nascimento', value: patient.birth_date ? date(patient.birth_date) : null },
            { label: 'CPF', value: patient.cpf },
            { label: 'RG', value: patient.rg },
            { label: 'Sexo', value: label(gender, patient.gender) },
            { label: 'Profissão', value: patient.profession },
            { label: 'Telefone', value: patient.phone },
            { label: 'WhatsApp', value: patient.whatsapp },
            { label: 'E-mail', value: patient.email },
            { label: 'Endereço', value: address || null },
          ]} />
        </Section>
        <Section title="Informações administrativas">
          <KeyValue cols={3} items={[
            { label: 'Unidade', value: unit?.name },
            { label: 'Status', value: label(patientStatus, patient.status) },
            { label: 'Data de cadastro', value: dateTime(patient.created_at, ctx.tz) },
            { label: 'Origem', value: label(origin, patient.origin) },
            { label: 'Indicação', value: patient.referred_by_name },
            { label: 'Responsável pelo cadastro', value: (registeredBy as any)?.full_name },
            { label: 'Observações', value: patient.notes },
          ]} />
        </Section>
        <Section title="Contatos de emergência">
          <ResourceSection resource="emergency_contacts" fixed={{ patient_id: patient.id }} compact hideSearch />
        </Section>
      </div>
      <Section title="Check-in">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={qr} alt="QR Code de check-in do aluno" className="mx-auto h-44 w-44 rounded-lg border bg-white p-2" />
        <p className="mt-3 text-center text-sm text-muted-foreground">Apresente este QR Code no tablet de check-in da recepção.</p>
        <p className="mt-2 text-center text-sm">PIN: <b>{patient.checkin_pin ? '••' + String(patient.checkin_pin).slice(-2) : 'não definido'}</b></p>
      </Section>
    </div>
  );
}

import { requirePermission } from '@/lib/auth/context';
import { PageHeader } from '@/components/ui/misc';
import { CheckinKiosk } from '@/components/app/agenda/checkin-kiosk';

export const metadata = { title: 'Check-in' };

export default async function CheckinPage() {
  await requirePermission('schedule.edit');
  return (
    <>
      <PageHeader title="Check-in" description="Modo recepção/tablet: leia o QR Code do aluno ou use o PIN. Integração facial poderá ser adicionada futuramente." />
      <CheckinKiosk />
    </>
  );
}

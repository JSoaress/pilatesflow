import { requirePermission } from '@/lib/auth/context';
import { PageHeader } from '@/components/ui/misc';
import { ResourceSection } from '@/components/resource/resource-page';

export const metadata = { title: 'Equipe' };

export default async function StaffPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  await requirePermission(['staff.view', 'schedule.view']);
  const sp = await searchParams;
  return (
    <>
      <PageHeader title="Equipe" description="Profissionais, horários de trabalho, férias e bloqueios. Clique em um profissional para ver detalhes." />
      <ResourceSection resource="staff" searchParams={sp} onRowClick="/app/equipe/{id}" />
    </>
  );
}

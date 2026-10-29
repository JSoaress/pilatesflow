import { requirePermission } from '@/lib/auth/context';
import { PageHeader } from '@/components/ui/misc';
import { TabLinks } from '@/components/ui/tab-links';
import { ResourceSection } from '@/components/resource/resource-page';

export const metadata = { title: 'Equipamentos' };

export default async function EquipmentPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  await requirePermission('equipment.view');
  const sp = await searchParams;
  const tab = sp.aba === 'manutencoes' ? 'manutencoes' : 'equipamentos';
  return (
    <>
      <PageHeader title="Equipamentos" description="Cadastro, status e histórico de manutenção dos aparelhos." />
      <TabLinks base="/app/equipamentos" active={tab} tabs={[{ id: 'equipamentos', label: 'Equipamentos' }, { id: 'manutencoes', label: 'Manutenções' }]} />
      {tab === 'equipamentos' ? <ResourceSection resource="equipment" searchParams={sp} /> : <ResourceSection resource="equipment_maintenance" searchParams={sp} />}
    </>
  );
}

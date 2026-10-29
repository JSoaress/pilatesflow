import { requirePermission } from '@/lib/auth/context';
import { PageHeader } from '@/components/ui/misc';
import { TabLinks } from '@/components/ui/tab-links';
import { ResourceSection } from '@/components/resource/resource-page';

export const metadata = { title: 'Unidades' };

export default async function UnitsPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  await requirePermission('settings.view');
  const sp = await searchParams;
  const tab = ['feriados', 'bloqueios'].includes(sp.aba) ? sp.aba : 'unidades';
  return (
    <>
      <PageHeader title="Unidades, feriados e bloqueios" description="O horário de funcionamento de cada unidade limita a agenda. Feriados e bloqueios impedem agendamentos (exceto com autorização)." />
      <TabLinks base="/app/configuracoes/unidades" active={tab} tabs={[{ id: 'unidades', label: 'Unidades' }, { id: 'feriados', label: 'Feriados' }, { id: 'bloqueios', label: 'Bloqueios de agenda' }]} />
      {tab === 'unidades' && <ResourceSection resource="units" searchParams={sp} />}
      {tab === 'feriados' && <ResourceSection resource="holidays" searchParams={sp} />}
      {tab === 'bloqueios' && <ResourceSection resource="schedule_blocks" searchParams={sp} />}
    </>
  );
}

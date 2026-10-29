import { requirePermission } from '@/lib/auth/context';
import { PageHeader } from '@/components/ui/misc';
import { ResourceSection } from '@/components/resource/resource-page';

export const metadata = { title: 'Modalidades' };

export default async function ServicesPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  await requirePermission('settings.view');
  return (
    <>
      <PageHeader title="Modalidades" description="Pilates aparelhos, solo, individual, dupla, grupo, avaliação, fisioterapia, aula experimental…" />
      <ResourceSection resource="services" searchParams={await searchParams} />
    </>
  );
}

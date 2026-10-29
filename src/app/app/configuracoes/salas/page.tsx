import { requirePermission } from '@/lib/auth/context';
import { PageHeader } from '@/components/ui/misc';
import { ResourceSection } from '@/components/resource/resource-page';

export const metadata = { title: 'Salas' };

export default async function RoomsPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  await requirePermission('settings.view');
  return (
    <>
      <PageHeader title="Salas" description="A capacidade da sala limita quantos alunos podem estar nela ao mesmo tempo, somando todos os atendimentos." />
      <ResourceSection resource="rooms" searchParams={await searchParams} />
    </>
  );
}

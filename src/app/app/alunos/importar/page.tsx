import { requirePermission } from '@/lib/auth/context';
import { PageHeader } from '@/components/ui/misc';
import { ImportPatients } from '@/components/app/import-patients';

export const metadata = { title: 'Importar alunos' };

export default async function ImportPage() {
  await requirePermission('patients.create');
  return (
    <>
      <PageHeader title="Importar alunos" description="Planilha CSV ou XLSX. Revise a pré-visualização antes de confirmar." back={{ href: '/app/alunos', label: 'Alunos' }} />
      <ImportPatients />
    </>
  );
}

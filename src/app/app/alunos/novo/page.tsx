import { requirePermission } from '@/lib/auth/context';
import { PageHeader } from '@/components/ui/misc';
import { PatientForm } from '@/components/app/patient-form';

export const metadata = { title: 'Novo aluno' };

export default async function NewPatientPage() {
  const ctx = await requirePermission('patients.create');
  return (
    <>
      <PageHeader title="Novo aluno" back={{ href: '/app/alunos', label: 'Alunos' }} />
      <div className="rounded-xl border bg-card p-6 shadow-soft">
        <PatientForm units={ctx.units.map((u) => ({ value: u.id, label: u.name }))} patient={ctx.unitId ? { unit_id: ctx.unitId } : null} />
      </div>
    </>
  );
}

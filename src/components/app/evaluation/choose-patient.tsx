'use client';
import * as React from 'react';
import { useRouter } from 'next/navigation';
import { PatientPicker, type PickedPatient } from '@/components/app/agenda/patient-picker';

/** Escolhe o aluno e volta para a mesma página com ?aluno=… */
export function ChoosePatient({ baseHref }: { baseHref: string }) {
  const router = useRouter();
  const [v, setV] = React.useState<PickedPatient[]>([]);
  return (
    <div className="max-w-md">
      <PatientPicker value={v} multiple={false} onChange={(x) => { setV(x); if (x[0]) router.push(`${baseHref}${baseHref.includes('?') ? '&' : '?'}aluno=${x[0].id}`); }} placeholder="Buscar aluno por nome ou telefone…" />
    </div>
  );
}

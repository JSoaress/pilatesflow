'use client';
import * as React from 'react';
import { Pencil } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { PatientForm } from '@/components/app/patient-form';

export function EditPatientButton({ patient, units }: { patient: Record<string, any>; units: { value: string; label: string }[] }) {
  const [open, setOpen] = React.useState(false);
  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}><Pencil /> Editar</Button>
      <Dialog open={open} onOpenChange={setOpen} title="Editar cadastro" size="xl">
        <PatientForm patient={patient} units={units} onDone={() => setOpen(false)} />
      </Dialog>
    </>
  );
}

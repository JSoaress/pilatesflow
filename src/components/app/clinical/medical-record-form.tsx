'use client';
import * as React from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Field, Textarea } from '@/components/ui/input';
import { saveMedicalRecord } from '@/lib/actions/clinical';
import { MR_GROUPS } from '@/lib/clinical-labels';

const GROUPS = MR_GROUPS;

export function MedicalRecordForm({ patientId, record, canEdit }: { patientId: string; record: Record<string, any> | null; canEdit: boolean }) {
  const router = useRouter();
  const [v, setV] = React.useState<Record<string, string>>(() => Object.fromEntries(GROUPS.flatMap((g) => g.fields).map(([k]) => [k, record?.[k] ?? ''])));
  const [editing, setEditing] = React.useState(!record);
  const [pending, setPending] = React.useState(false);
  const save = async () => {
    setPending(true);
    const r = await saveMedicalRecord(patientId, v);
    setPending(false);
    if (!r.ok) { toast.error(r.error); return; }
    toast.success('Prontuário salvo. A versão anterior foi mantida no histórico.');
    setEditing(false);
    router.refresh();
  };
  if (!editing) {
    return (
      <div className="space-y-6">
        {GROUPS.map((g) => (
          <div key={g.title}>
            <h4 className="mb-2 text-sm font-semibold text-muted-foreground">{g.title}</h4>
            <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
              {g.fields.filter(([k]) => v[k]).map(([k, l]) => <div key={k}><dt className="text-xs text-muted-foreground">{l}</dt><dd className="whitespace-pre-wrap">{v[k]}</dd></div>)}
              {!g.fields.some(([k]) => v[k]) && <p className="text-muted-foreground">Não preenchido.</p>}
            </dl>
          </div>
        ))}
        {canEdit && <Button variant="outline" onClick={() => setEditing(true)}>Editar prontuário</Button>}
      </div>
    );
  }
  if (!canEdit) return <p className="text-sm text-muted-foreground">Prontuário ainda não preenchido.</p>;
  return (
    <form className="space-y-6" onSubmit={(e) => { e.preventDefault(); save(); }}>
      {GROUPS.map((g) => (
        <fieldset key={g.title}>
          <legend className="mb-2 text-sm font-semibold text-muted-foreground">{g.title}</legend>
          <div className="grid gap-4 sm:grid-cols-2">
            {g.fields.map(([k, l]) => (
              <Field key={k} label={l} htmlFor={`mr-${k}`}><Textarea id={`mr-${k}`} rows={3} value={v[k]} onChange={(e) => setV({ ...v, [k]: e.target.value })} /></Field>
            ))}
          </div>
        </fieldset>
      ))}
      <div className="flex gap-2">
        <Button type="submit" loading={pending}>Salvar prontuário</Button>
        {record && <Button type="button" variant="outline" onClick={() => setEditing(false)}>Cancelar</Button>}
      </div>
    </form>
  );
}

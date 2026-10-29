'use client';
import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Field, Input, Textarea, Checkbox } from '@/components/ui/input';
import { EmptyState, Table, Td, Th, Tr } from '@/components/ui/misc';
import { Badge } from '@/components/ui/badge';
import { useConfirm } from '@/components/ui/confirm';
import { saveEvolutionTemplate, deleteEvolutionTemplate } from '@/lib/actions/settings';

type Defaults = { patient_state?: string; complaints?: string; treatment_response?: string; guidance?: string; next_conduct?: string; notes?: string };
type Row = { id: string; name: string; is_active: boolean; defaults: Defaults | null };

const DEFAULT_FIELDS: { key: keyof Defaults; label: string; wide?: boolean }[] = [
  { key: 'complaints', label: 'Queixas' },
  { key: 'patient_state', label: 'Estado do paciente' },
  { key: 'treatment_response', label: 'Resposta ao tratamento', wide: true },
  { key: 'guidance', label: 'Orientações' },
  { key: 'next_conduct', label: 'Próxima conduta' },
  { key: 'notes', label: 'Observações', wide: true },
];

type FormValues = { name: string; is_active: boolean } & Record<keyof Defaults, string>;

function emptyValues(row?: Row | null): FormValues {
  const defaults = Object.fromEntries(
    DEFAULT_FIELDS.map((f) => [f.key, row?.defaults?.[f.key] ?? '']),
  ) as Pick<FormValues, keyof Defaults>;

  return {
    name: row?.name ?? '',
    is_active: row?.is_active ?? true,
    ...defaults,
  };
}

/** Lista + criação/edição em diálogo + exclusão dos modelos de evolução (valores sugeridos ao registrar uma evolução clínica). */
export function EvolutionTemplatesManager({ rows, canEdit }: { rows: Row[]; canEdit: boolean }) {
  const router = useRouter();
  const confirm = useConfirm();
  const [editing, setEditing] = React.useState<Row | null>(null);
  const [open, setOpen] = React.useState(false);
  const [values, setValues] = React.useState<FormValues>(emptyValues());
  const [error, setError] = React.useState('');
  const [saving, setSaving] = React.useState(false);

  const openForm = (row?: Row) => { setEditing(row ?? null); setValues(emptyValues(row)); setError(''); setOpen(true); };

  const save = async () => {
    if (!values.name.trim()) { setError('Informe o nome do modelo.'); return; }
    setSaving(true);
    const res = await saveEvolutionTemplate(editing?.id ?? null, {
      name: values.name, is_active: values.is_active,
      defaults: Object.fromEntries(DEFAULT_FIELDS.map((f) => [f.key, values[f.key] ?? ''])) as Required<Defaults>,
    });
    setSaving(false);
    if (!res.ok) { setError(res.error); toast.error(res.error); return; }
    toast.success(editing ? 'Modelo atualizado.' : 'Modelo cadastrado.');
    setOpen(false);
    router.refresh();
  };

  const remove = async (row: Row) => {
    const { confirmed } = await confirm({ title: 'Excluir modelo de evolução?', description: 'Esta ação não pode ser desfeita.', confirmLabel: 'Excluir', destructive: true });
    if (!confirmed) return;
    const res = await deleteEvolutionTemplate(row.id);
    if (!res.ok) toast.error(res.error); else { toast.success('Modelo excluído.'); router.refresh(); }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">Valores sugeridos ao registrar uma evolução — a equipe pode ajustá-los antes de salvar.</p>
        {canEdit && <Button onClick={() => openForm()}><Plus /> Novo modelo</Button>}
      </div>

      {rows.length === 0 ? (
        <EmptyState title="Nenhum modelo cadastrado" description={canEdit ? 'Clique em "Novo modelo" para criar o primeiro.' : undefined} />
      ) : (
        <Table>
          <thead>
            <tr><Th>Nome</Th><Th>Status</Th>{canEdit && <Th className="w-px text-right">Ações</Th>}</tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <Tr key={row.id}>
                <Td>{row.name}</Td>
                <Td><Badge variant={row.is_active ? 'success' : 'neutral'}>{row.is_active ? 'Ativo' : 'Inativo'}</Badge></Td>
                {canEdit && (
                  <Td className="whitespace-nowrap text-right">
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="icon-sm" onClick={() => openForm(row)} aria-label="Editar"><Pencil /></Button>
                      <Button variant="ghost" size="icon-sm" onClick={() => remove(row)} aria-label="Excluir"><Trash2 className="text-destructive" /></Button>
                    </div>
                  </Td>
                )}
              </Tr>
            ))}
          </tbody>
        </Table>
      )}

      <Dialog open={open} onOpenChange={setOpen} size="lg" title={editing ? 'Editar modelo' : 'Novo modelo de evolução'}
        description="Deixe em branco o que não deve vir preenchido por padrão."
        footer={<><Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button><Button onClick={save} loading={saving}>Salvar</Button></>}>
        <form onSubmit={(e) => { e.preventDefault(); save(); }} className="space-y-4">
          {error && <p className="text-sm font-medium text-destructive" role="alert">{error}</p>}
          <Field label="Nome do modelo" htmlFor="evo-name" required>
            <Input id="evo-name" value={values.name} onChange={(e) => setValues((v) => ({ ...v, name: e.target.value }))} placeholder="Ex.: Avaliação de rotina" />
          </Field>
          <Checkbox label="Ativo" checked={values.is_active} onChange={(e) => setValues((v) => ({ ...v, is_active: e.target.checked }))} />
          <div className="grid gap-4 sm:grid-cols-2">
            {DEFAULT_FIELDS.map((f) => (
              <Field key={f.key} label={f.label} htmlFor={`evo-${f.key}`} className={f.wide ? 'sm:col-span-2' : undefined}>
                <Textarea id={`evo-${f.key}`} value={values[f.key] ?? ''} onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))} />
              </Field>
            ))}
          </div>
          <button type="submit" className="hidden" />
        </form>
      </Dialog>
    </div>
  );
}

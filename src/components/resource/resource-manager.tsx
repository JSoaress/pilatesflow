'use client';
import * as React from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { Plus, Pencil, Trash2, Search, ChevronLeft, ChevronRight, Download } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog } from '@/components/ui/dialog';
import { EmptyState, Table, Td, Th, Tr } from '@/components/ui/misc';
import { useConfirm } from '@/components/ui/confirm';
import { saveResource, deleteResource } from '@/lib/actions/resources';
import type { Option, ResourceDef } from '@/lib/resources/types';
import { ResourceFields, initialValues } from './resource-form';
import { Cell } from './cell';

export type ResourceManagerProps = {
  def: ResourceDef;
  rows: Record<string, unknown>[];
  total: number;
  page: number;
  pageSize: number;
  refOptions: Record<string, Option[]>;
  tz: string;
  can: { create: boolean; edit: boolean; delete: boolean; export?: boolean };
  fixed?: Record<string, string>;
  compact?: boolean;
  /** ações extras por linha (renderizadas no cliente) */
  rowActions?: (row: Record<string, unknown>) => React.ReactNode;
  hideSearch?: boolean;
  exportHref?: string;
  onRowClick?: string; // padrão de href ex.: "/app/equipe/{id}"
};

/** Lista + busca + paginação + criação/edição em diálogo + exclusão com confirmação. */
export function ResourceManager({ def, rows, total, page, pageSize, refOptions, tz, can, fixed, compact, rowActions, hideSearch, exportHref, onRowClick }: ResourceManagerProps) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const confirm = useConfirm();
  const [editing, setEditing] = React.useState<Record<string, unknown> | null>(null);
  const [open, setOpen] = React.useState(false);
  const [values, setValues] = React.useState<Record<string, unknown>>({});
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [saving, setSaving] = React.useState(false);
  const [q, setQ] = React.useState(sp.get('q') ?? '');
  const listFields = def.fields.filter((f) => f.list && f.name !== def.parentField);
  const pages = Math.max(1, Math.ceil(total / pageSize));

  const openForm = (row?: Record<string, unknown>) => {
    setEditing(row ?? null);
    setValues(initialValues(def, row));
    setErrors({});
    setOpen(true);
  };

  const navigate = (params: Record<string, string | null>) => {
    const n = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(params)) if (v === null || v === '') n.delete(k); else n.set(k, v);
    router.replace(`${pathname}?${n.toString()}`, { scroll: false });
  };

  React.useEffect(() => {
    if (hideSearch) return;
    const t = setTimeout(() => { if ((sp.get('q') ?? '') !== q) navigate({ q, p: null }); }, 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const save = async () => {
    setSaving(true);
    const res = await saveResource(def.key, (editing?.id as string) ?? null, values, fixed);
    setSaving(false);
    if (!res.ok) {
      setErrors(res.fieldErrors ?? {});
      toast.error(res.error);
      return;
    }
    toast.success(editing ? `${def.singular} atualizado(a).` : `${def.singular} cadastrado(a).`);
    setOpen(false);
    router.refresh();
  };

  const remove = async (row: Record<string, unknown>) => {
    const { confirmed } = await confirm({
      title: `Excluir ${def.singular.toLowerCase()}?`,
      description: def.softDelete ? 'O registro será arquivado e deixará de aparecer nas listas. O histórico é mantido.' : 'Esta ação não pode ser desfeita.',
      confirmLabel: 'Excluir', destructive: true,
    });
    if (!confirmed) return;
    const res = await deleteResource(def.key, row.id as string);
    if (!res.ok) toast.error(res.error); else { toast.success('Registro excluído.'); router.refresh(); }
  };

  return (
    <div className="space-y-4">
      {(!hideSearch || can.create) && (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          {!hideSearch && def.searchFields?.length ? (
            <div className="relative w-full sm:max-w-xs">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar…" className="pl-9" aria-label={`Buscar ${def.title.toLowerCase()}`} />
            </div>
          ) : <span />}
          <div className="flex gap-2">
            {exportHref && can.export && <a href={exportHref}><Button variant="outline"><Download /> Exportar</Button></a>}
            {can.create && <Button onClick={() => openForm()}><Plus /> {compact ? 'Adicionar' : `Novo(a) ${def.singular.toLowerCase()}`}</Button>}
          </div>
        </div>
      )}

      {rows.length === 0 ? (
        <EmptyState title={q ? 'Nada encontrado' : def.emptyText ?? `Nenhum(a) ${def.singular.toLowerCase()} cadastrado(a)`}
          description={q ? 'Tente outro termo de busca.' : can.create ? 'Clique em adicionar para criar o primeiro registro.' : undefined} />
      ) : (
        <Table>
          <thead>
            <tr>
              {listFields.map((f) => <Th key={f.name}>{f.label}</Th>)}
              {(can.edit || can.delete || rowActions) && <Th className="w-px text-right">Ações</Th>}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <Tr key={row.id as string} className={onRowClick ? 'cursor-pointer' : undefined}
                onClick={onRowClick ? (e) => { if ((e.target as HTMLElement).closest('button,a')) return; router.push(onRowClick.replace('{id}', String(row.id))); } : undefined}>
                {listFields.map((f) => <Td key={f.name}><Cell f={f} value={row[f.name]} options={refOptions[f.name]} tz={tz} /></Td>)}
                {(can.edit || can.delete || rowActions) && (
                  <Td className="whitespace-nowrap text-right">
                    <div className="flex justify-end gap-1">
                      {rowActions?.(row)}
                      {can.edit && <Button variant="ghost" size="icon-sm" onClick={() => openForm(row)} aria-label="Editar"><Pencil /></Button>}
                      {can.delete && !def.noDelete && <Button variant="ghost" size="icon-sm" onClick={() => remove(row)} aria-label="Excluir"><Trash2 className="text-destructive" /></Button>}
                    </div>
                  </Td>
                )}
              </Tr>
            ))}
          </tbody>
        </Table>
      )}

      {pages > 1 && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>{total} registro(s) · página {page} de {pages}</span>
          <div className="flex gap-1">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => navigate({ p: String(page - 1) })}><ChevronLeft /> Anterior</Button>
            <Button variant="outline" size="sm" disabled={page >= pages} onClick={() => navigate({ p: String(page + 1) })}>Próxima <ChevronRight /></Button>
          </div>
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen} size={def.fields.length > 10 ? 'lg' : 'md'}
        title={editing ? `Editar ${def.singular.toLowerCase()}` : `Novo(a) ${def.singular.toLowerCase()}`}
        description={def.description}
        footer={<><Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button><Button onClick={save} loading={saving}>Salvar</Button></>}>
        <form onSubmit={(e) => { e.preventDefault(); save(); }}>
          <ResourceFields def={def} values={values} setValues={setValues} refOptions={refOptions} tz={tz} editing={!!editing} errors={errors} exclude={def.parentField && fixed?.[def.parentField] ? [def.parentField] : []} />
          <button type="submit" className="hidden" />
        </form>
      </Dialog>
    </div>
  );
}

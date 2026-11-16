'use client';
import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Pencil } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog } from '@/components/ui/dialog';
import { Field, Input, Textarea, Checkbox } from '@/components/ui/input';
import { saveEvolutionTemplate } from '@/lib/actions/settings';

type Tpl = { id: string; name: string; is_active: boolean; defaults: Record<string, string> };
const FIELDS: [string, string][] = [['patient_state', 'Estado do paciente'], ['complaints', 'Queixas'], ['treatment_response', 'Resposta ao tratamento'], ['guidance', 'Orientações'], ['next_conduct', 'Conduta para a próxima sessão'], ['notes', 'Observações']];

export function EvolutionTemplates({ items, canEdit }: { items: Tpl[]; canEdit: boolean }) {
  const router = useRouter();
  const [edit, setEdit] = React.useState<Tpl | null>(null);
  const [pending, setPending] = React.useState(false);
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">Textos sugeridos que o profissional pode aplicar ao registrar a evolução e depois ajustar.</p>
      {canEdit && <Button size="sm" onClick={() => setEdit({ id: '', name: '', is_active: true, defaults: {} })}><Plus />Novo modelo</Button>}
      <ul className="divide-y rounded-xl border bg-card">
        {items.length === 0 && <li className="p-4 text-sm text-muted-foreground">Nenhum modelo de evolução.</li>}
        {items.map((t) => (
          <li key={t.id} className="flex items-center justify-between gap-2 p-3">
            <span className="text-sm">{t.name} {!t.is_active && <Badge variant="neutral">inativo</Badge>}</span>
            {canEdit && <Button size="icon-sm" variant="ghost" aria-label="Editar" onClick={() => setEdit(t)}><Pencil /></Button>}
          </li>
        ))}
      </ul>
      {edit && (
        <Dialog open onOpenChange={(o) => !o && setEdit(null)} size="lg" title={edit.id ? 'Editar modelo de evolução' : 'Novo modelo de evolução'}
          footer={<><Button variant="ghost" onClick={() => setEdit(null)}>Cancelar</Button><Button loading={pending} onClick={async () => {
            setPending(true);
            const r = await saveEvolutionTemplate(edit.id || null, { name: edit.name, is_active: edit.is_active, defaults: edit.defaults as any });
            setPending(false);
            if (r.ok) { toast.success('Modelo salvo.'); setEdit(null); router.refresh(); } else toast.error(r.error);
          }}>Salvar</Button></>}>
          <div className="space-y-3">
            <Field label="Nome" htmlFor="et-name" required><Input id="et-name" value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></Field>
            {FIELDS.map(([k, l]) => <Field key={k} label={l} htmlFor={`et-${k}`}><Textarea id={`et-${k}`} rows={2} value={edit.defaults[k] ?? ''} onChange={(e) => setEdit({ ...edit, defaults: { ...edit.defaults, [k]: e.target.value } })} /></Field>)}
            <Checkbox checked={edit.is_active} onChange={(e) => setEdit({ ...edit, is_active: e.target.checked })} label="Ativo" />
          </div>
        </Dialog>
      )}
    </div>
  );
}

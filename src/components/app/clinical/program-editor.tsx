'use client';
import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Trash2, ArrowUp, ArrowDown, Archive, Pencil } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Field, Input, Select, Textarea } from '@/components/ui/input';
import { useConfirm } from '@/components/ui/confirm';
import { saveProgramItem, removeProgramItem, moveProgramItem, archiveProgram, createProgram, applyProgramTemplate } from '@/lib/actions/clinical';

type Item = { id: string; sets: number | null; repetitions: string | null; duration_seconds: number | null; load: string | null; springs: string | null; notes: string | null; progression: string | null; exercise: { id: string; name: string } };
type Ex = { id: string; name: string; springs_config?: string | null; repetitions?: string | null };

function ItemForm({ programId, item, exercises, onDone }: { programId: string; item?: Item; exercises: Ex[]; onDone: () => void }) {
  const router = useRouter();
  const [v, setV] = React.useState({ exercise_id: item?.exercise.id ?? exercises[0]?.id ?? '', sets: String(item?.sets ?? ''), repetitions: item?.repetitions ?? '', duration_seconds: String(item?.duration_seconds ?? ''), load: item?.load ?? '', springs: item?.springs ?? '', notes: item?.notes ?? '', progression: item?.progression ?? '' });
  const [pending, setPending] = React.useState(false);
  const set = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setV({ ...v, [k]: e.target.value });
  return (
    <form className="grid gap-4 sm:grid-cols-2" onSubmit={async (e) => {
      e.preventDefault();
      setPending(true);
      const r = await saveProgramItem(programId, item?.id ?? null, v);
      setPending(false);
      if (!r.ok) { toast.error(r.error); return; }
      router.refresh(); onDone();
    }}>
      <Field label="Exercício" htmlFor="pi-ex" required className="sm:col-span-2">
        <Select id="pi-ex" value={v.exercise_id} onChange={(e) => { const ex = exercises.find((x) => x.id === e.target.value); setV({ ...v, exercise_id: e.target.value, springs: v.springs || ex?.springs_config || '', repetitions: v.repetitions || ex?.repetitions || '' }); }}>
          {exercises.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
        </Select>
      </Field>
      <Field label="Séries" htmlFor="pi-sets"><Input id="pi-sets" type="number" min={1} value={v.sets} onChange={set('sets')} /></Field>
      <Field label="Repetições" htmlFor="pi-reps"><Input id="pi-reps" value={v.repetitions} onChange={set('repetitions')} /></Field>
      <Field label="Tempo (segundos)" htmlFor="pi-time"><Input id="pi-time" type="number" min={1} value={v.duration_seconds} onChange={set('duration_seconds')} /></Field>
      <Field label="Molas" htmlFor="pi-springs"><Input id="pi-springs" value={v.springs} onChange={set('springs')} /></Field>
      <Field label="Carga" htmlFor="pi-load"><Input id="pi-load" value={v.load} onChange={set('load')} /></Field>
      <Field label="Progressão" htmlFor="pi-prog"><Input id="pi-prog" value={v.progression} onChange={set('progression')} /></Field>
      <Field label="Observação" htmlFor="pi-notes" className="sm:col-span-2"><Textarea id="pi-notes" rows={2} value={v.notes} onChange={set('notes')} /></Field>
      <div className="sm:col-span-2"><Button type="submit" loading={pending}>Salvar</Button></div>
    </form>
  );
}

export function ProgramEditor({ programId, items, exercises, canEdit }: { programId: string; status: string; items: Item[]; exercises: Ex[]; canEdit: boolean }) {
  const router = useRouter();
  const confirm = useConfirm();
  const [adding, setAdding] = React.useState(false);
  const [editing, setEditing] = React.useState<Item | null>(null);
  return (
    <div>
      {items.length === 0 ? <p className="text-sm text-muted-foreground">Nenhum exercício no programa.</p> : (
        <ol className="space-y-2">
          {items.map((it, i) => (
            <li key={it.id} className="flex flex-wrap items-center gap-3 rounded-lg border bg-muted/30 p-3">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary-soft text-xs font-semibold text-primary">{i + 1}</span>
              <div className="min-w-0 flex-1">
                <p className="font-medium">{it.exercise?.name}</p>
                <p className="text-xs text-muted-foreground">
                  {[it.sets && `${it.sets} séries`, it.repetitions && `${it.repetitions} rep.`, it.duration_seconds && `${it.duration_seconds}s`, it.springs && `molas: ${it.springs}`, it.load && `carga: ${it.load}`].filter(Boolean).join(' · ') || 'Sem parâmetros'}
                  {it.progression && <> · progressão: {it.progression}</>}
                </p>
                {it.notes && <p className="text-xs text-muted-foreground">{it.notes}</p>}
              </div>
              {canEdit && (
                <div className="flex gap-1">
                  <Button variant="ghost" size="icon-sm" aria-label="Subir" disabled={i === 0} onClick={async () => { await moveProgramItem(programId, it.id, -1); router.refresh(); }}><ArrowUp /></Button>
                  <Button variant="ghost" size="icon-sm" aria-label="Descer" disabled={i === items.length - 1} onClick={async () => { await moveProgramItem(programId, it.id, 1); router.refresh(); }}><ArrowDown /></Button>
                  <Button variant="ghost" size="icon-sm" aria-label="Editar" onClick={() => setEditing(it)}><Pencil /></Button>
                  <Button variant="ghost" size="icon-sm" aria-label="Remover" onClick={async () => { const r = await removeProgramItem(it.id); if (r.ok) router.refresh(); else toast.error(r.error); }}><Trash2 className="text-destructive" /></Button>
                </div>
              )}
            </li>
          ))}
        </ol>
      )}
      {canEdit && (
        <div className="mt-3 flex gap-2">
          <Button size="sm" variant="outline" onClick={() => setAdding(true)} disabled={!exercises.length}><Plus /> Adicionar exercício</Button>
          <Button size="sm" variant="ghost" onClick={async () => {
            const { confirmed } = await confirm({ title: 'Arquivar programa?', confirmLabel: 'Arquivar' });
            if (confirmed) { const r = await archiveProgram(programId); if (r.ok) router.refresh(); else toast.error(r.error); }
          }}><Archive /> Arquivar</Button>
        </div>
      )}
      <Dialog open={adding} onOpenChange={setAdding} title="Adicionar exercício"><ItemForm programId={programId} exercises={exercises} onDone={() => setAdding(false)} /></Dialog>
      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)} title="Editar exercício">{editing && <ItemForm programId={programId} item={editing} exercises={exercises} onDone={() => setEditing(null)} />}</Dialog>
    </div>
  );
}

export function NewProgramButton({ patientId, templates, isTemplate }: { patientId?: string; templates?: { id: string; name: string }[]; isTemplate?: boolean }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [mode, setMode] = React.useState<'blank' | 'template'>('blank');
  const [v, setV] = React.useState({ name: '', goal: '', template: templates?.[0]?.id ?? '' });
  const [pending, setPending] = React.useState(false);
  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}><Plus /> {isTemplate ? 'Novo modelo' : 'Novo programa'}</Button>
      <Dialog open={open} onOpenChange={setOpen} size="sm" title={isTemplate ? 'Novo modelo de programa' : 'Novo programa de exercícios'}>
        <form className="space-y-4" onSubmit={async (e) => {
          e.preventDefault();
          setPending(true);
          const r = mode === 'template' && patientId ? await applyProgramTemplate(v.template, patientId) : await createProgram({ patient_id: patientId ?? null, name: v.name, goal: v.goal, is_template: !!isTemplate });
          setPending(false);
          if (!r.ok) { toast.error(r.error); return; }
          toast.success('Programa criado.');
          setOpen(false);
          router.refresh();
        }}>
          {!isTemplate && templates && templates.length > 0 && (
            <div className="flex gap-2">
              <Button type="button" size="sm" variant={mode === 'blank' ? 'default' : 'outline'} onClick={() => setMode('blank')}>Em branco</Button>
              <Button type="button" size="sm" variant={mode === 'template' ? 'default' : 'outline'} onClick={() => setMode('template')}>A partir de modelo</Button>
            </div>
          )}
          {mode === 'template' ? (
            <Field label="Modelo" htmlFor="np-tpl"><Select id="np-tpl" value={v.template} onChange={(e) => setV({ ...v, template: e.target.value })}>{(templates ?? []).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</Select></Field>
          ) : (
            <>
              <Field label="Nome" htmlFor="np-name" required><Input id="np-name" value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} placeholder="Ex.: Fortalecimento de core" /></Field>
              <Field label="Objetivo" htmlFor="np-goal"><Input id="np-goal" value={v.goal} onChange={(e) => setV({ ...v, goal: e.target.value })} /></Field>
            </>
          )}
          <Button type="submit" loading={pending}>Criar</Button>
        </form>
      </Dialog>
    </>
  );
}

'use client';
import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Trash2, Lock, FilePen, MoreHorizontal } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Field, Input, Select, Textarea } from '@/components/ui/input';
import { Menu, MenuItem } from '@/components/ui/menu';
import { useConfirm } from '@/components/ui/confirm';
import { saveEvolution, finalizeEvolution, deleteDraftEvolution, addEvolutionAddendum } from '@/lib/actions/clinical';
import { todayISO } from '@/lib/format';

type Ex = { exercise_id?: string | null; name: string; springs?: string; load?: string; sets?: string; reps?: string; time?: string; notes?: string };
type Props = { patientId: string; templates: { id: string; name: string; defaults: Record<string, string> }[]; exercises: { id: string; name: string }[]; appointments: { id: string; label: string }[] };

function nowTime() {
  return new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'America/Sao_Paulo' }).format(new Date());
}

function EvolutionForm({ patientId, templates, exercises, appointments, evolution, onDone }: Props & { evolution?: any; onDone: () => void }) {
  const router = useRouter();
  const confirm = useConfirm();
  const init = evolution ? {
    ...evolution,
    occurred_date: new Date(evolution.occurred_at).toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' }),
    occurred_time: new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'America/Sao_Paulo' }).format(new Date(evolution.occurred_at)),
  } : { occurred_date: todayISO(), occurred_time: nowTime(), appointment_id: appointments[0]?.id ?? '' };
  const [v, setV] = React.useState<Record<string, any>>({ complaints: '', patient_state: '', treatment_response: '', incidents: '', guidance: '', next_conduct: '', notes: '', pain_before: '', pain_after: '', ...init });
  const [items, setItems] = React.useState<Ex[]>(Array.isArray(evolution?.exercises) ? evolution.exercises : []);
  const [pending, setPending] = React.useState(false);
  const set = (k: string) => (e: React.ChangeEvent<any>) => setV({ ...v, [k]: e.target.value });
  const submit = async (finalize: boolean) => {
    if (finalize) {
      const { confirmed } = await confirm({ title: 'Finalizar evolução?', description: 'Após finalizada, a evolução não poderá ser alterada nem excluída. Correções serão feitas por adendo, mantendo o histórico.', confirmLabel: 'Finalizar e assinar' });
      if (!confirmed) return;
    }
    setPending(true);
    const r = await saveEvolution(evolution?.id ?? null, {
      patient_id: patientId, appointment_id: v.appointment_id || null, occurred_date: v.occurred_date, occurred_time: v.occurred_time,
      complaints: v.complaints, patient_state: v.patient_state, treatment_response: v.treatment_response, incidents: v.incidents, guidance: v.guidance,
      next_conduct: v.next_conduct, notes: v.notes, pain_before: v.pain_before, pain_after: v.pain_after,
      exercises: items.filter((i) => i.name.trim()).map((i) => ({ ...i, sets: i.sets ? String(i.sets) : null })), finalize,
    } as any);
    setPending(false);
    if (!r.ok) { toast.error(r.error); return; }
    toast.success(finalize ? 'Evolução finalizada (autor, data e hora registrados).' : 'Rascunho salvo.');
    router.refresh();
    onDone();
  };
  return (
    <form className="space-y-5" onSubmit={(e) => { e.preventDefault(); submit(false); }}>
      <div className="grid gap-4 sm:grid-cols-3">
        {templates.length > 0 && !evolution && (
          <Field label="Modelo" htmlFor="evo-tpl"><Select id="evo-tpl" defaultValue="" onChange={(e) => { const t = templates.find((x) => x.id === e.target.value); if (t) setV({ ...v, ...t.defaults }); }}><option value="">Sem modelo</option>{templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</Select></Field>
        )}
        <Field label="Atendimento" htmlFor="evo-appt"><Select id="evo-appt" value={v.appointment_id ?? ''} onChange={set('appointment_id')}><option value="">Avulso</option>{appointments.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}</Select></Field>
        <Field label="Data" htmlFor="evo-date"><Input id="evo-date" type="date" value={v.occurred_date} onChange={set('occurred_date')} /></Field>
        <Field label="Hora" htmlFor="evo-time"><Input id="evo-time" type="time" value={v.occurred_time} onChange={set('occurred_time')} /></Field>
        <Field label="Dor antes (0–10)" htmlFor="evo-pb"><Input id="evo-pb" type="number" min={0} max={10} value={v.pain_before ?? ''} onChange={set('pain_before')} /></Field>
        <Field label="Dor depois (0–10)" htmlFor="evo-pa"><Input id="evo-pa" type="number" min={0} max={10} value={v.pain_after ?? ''} onChange={set('pain_after')} /></Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        {[['complaints', 'Queixas'], ['patient_state', 'Estado do paciente'], ['treatment_response', 'Resposta ao tratamento'], ['incidents', 'Intercorrências'], ['guidance', 'Orientações'], ['next_conduct', 'Próxima conduta']].map(([k, l]) => (
          <Field key={k} label={l} htmlFor={`evo-${k}`}><Textarea id={`evo-${k}`} rows={2} value={v[k] ?? ''} onChange={set(k)} /></Field>
        ))}
      </div>
      <div>
        <div className="mb-2 flex items-center justify-between">
          <p className="text-sm font-medium">Exercícios realizados</p>
          <Button type="button" size="sm" variant="outline" onClick={() => setItems([...items, { name: '' }])}><Plus /> Exercício</Button>
        </div>
        {items.length === 0 && <p className="text-sm text-muted-foreground">Nenhum exercício adicionado.</p>}
        <div className="space-y-2">
          {items.map((it, i) => (
            <div key={i} className="grid grid-cols-2 gap-2 rounded-lg border p-2 sm:grid-cols-[2fr_1fr_1fr_.6fr_.8fr_.8fr_auto]">
              <Input list="evo-exercises" aria-label="Exercício" placeholder="Exercício" value={it.name} onChange={(e) => { const ex = exercises.find((x) => x.name === e.target.value); setItems(items.map((x, j) => j === i ? { ...x, name: e.target.value, exercise_id: ex?.id ?? null } : x)); }} />
              <Input aria-label="Molas" placeholder="Molas" value={it.springs ?? ''} onChange={(e) => setItems(items.map((x, j) => j === i ? { ...x, springs: e.target.value } : x))} />
              <Input aria-label="Carga" placeholder="Carga" value={it.load ?? ''} onChange={(e) => setItems(items.map((x, j) => j === i ? { ...x, load: e.target.value } : x))} />
              <Input aria-label="Séries" placeholder="Séries" value={it.sets ?? ''} onChange={(e) => setItems(items.map((x, j) => j === i ? { ...x, sets: e.target.value } : x))} />
              <Input aria-label="Repetições" placeholder="Rep." value={it.reps ?? ''} onChange={(e) => setItems(items.map((x, j) => j === i ? { ...x, reps: e.target.value } : x))} />
              <Input aria-label="Tempo" placeholder="Tempo" value={it.time ?? ''} onChange={(e) => setItems(items.map((x, j) => j === i ? { ...x, time: e.target.value } : x))} />
              <Button type="button" variant="ghost" size="icon" aria-label="Remover" onClick={() => setItems(items.filter((_, j) => j !== i))}><Trash2 /></Button>
            </div>
          ))}
        </div>
        <datalist id="evo-exercises">{exercises.map((e) => <option key={e.id} value={e.name} />)}</datalist>
      </div>
      <Field label="Observações" htmlFor="evo-notes"><Textarea id="evo-notes" rows={3} value={v.notes ?? ''} onChange={set('notes')} /></Field>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" variant="outline" loading={pending}>Salvar rascunho</Button>
        <Button type="button" onClick={() => submit(true)} disabled={pending}><Lock /> Finalizar evolução</Button>
      </div>
    </form>
  );
}

export function EvolutionButton(props: Props) {
  const [open, setOpen] = React.useState(false);
  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}><Plus /> Nova evolução</Button>
      <Dialog open={open} onOpenChange={setOpen} size="xl" title="Nova evolução"><EvolutionForm {...props} onDone={() => setOpen(false)} /></Dialog>
    </>
  );
}

export function EvolutionActions({ evolution, patientId, canCreate, isAuthor, ...rest }: { evolution: any; patientId: string; canCreate: boolean; isAuthor: boolean } & Omit<Props, 'patientId'>) {
  const router = useRouter();
  const confirm = useConfirm();
  const [edit, setEdit] = React.useState(false);
  const [addendum, setAddendum] = React.useState(false);
  const [text, setText] = React.useState('');
  const [reason, setReason] = React.useState('');
  if (!canCreate) return null;
  return (
    <>
      <Menu trigger={(p) => <Button variant="ghost" size="icon-sm" aria-label="Ações da evolução" {...p}><MoreHorizontal /></Button>}>
        {(close) => evolution.status === 'draft' ? (
          <>
            <MenuItem onClick={() => { close(); setEdit(true); }}><FilePen /> Editar rascunho</MenuItem>
            <MenuItem onClick={async () => {
              close();
              const { confirmed } = await confirm({ title: 'Finalizar evolução?', description: 'Após finalizada não poderá ser alterada.', confirmLabel: 'Finalizar' });
              if (!confirmed) return;
              const r = await finalizeEvolution(evolution.id, patientId);
              if (r.ok) { toast.success('Evolução finalizada.'); router.refresh(); } else toast.error(r.error);
            }}><Lock /> Finalizar</MenuItem>
            {isAuthor && <MenuItem destructive onClick={async () => {
              close();
              const { confirmed } = await confirm({ title: 'Excluir rascunho?', destructive: true, confirmLabel: 'Excluir' });
              if (!confirmed) return;
              const r = await deleteDraftEvolution(evolution.id, patientId);
              if (r.ok) { toast.success('Rascunho excluído.'); router.refresh(); } else toast.error(r.error);
            }}><Trash2 /> Excluir rascunho</MenuItem>}
          </>
        ) : (
          <MenuItem onClick={() => { close(); setAddendum(true); }}><FilePen /> Adendo / retificação</MenuItem>
        )}
      </Menu>
      <Dialog open={edit} onOpenChange={setEdit} size="xl" title="Editar rascunho de evolução"><EvolutionForm patientId={patientId} {...rest} evolution={evolution} onDone={() => setEdit(false)} /></Dialog>
      <Dialog open={addendum} onOpenChange={setAddendum} title="Adendo / retificação" description="O registro original é preservado. O adendo fica vinculado, com autor, data e motivo."
        footer={<><Button variant="outline" onClick={() => setAddendum(false)}>Cancelar</Button><Button onClick={async () => {
          const r = await addEvolutionAddendum(evolution.id, patientId, text, reason);
          if (r.ok) { toast.success('Adendo registrado.'); setAddendum(false); setText(''); setReason(''); router.refresh(); } else toast.error(r.error);
        }}>Registrar adendo</Button></>}>
        <div className="space-y-4">
          <Field label="Motivo da retificação" htmlFor="add-reason" required><Input id="add-reason" value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
          <Field label="Texto do adendo" htmlFor="add-text" required><Textarea id="add-text" rows={5} value={text} onChange={(e) => setText(e.target.value)} /></Field>
        </div>
      </Dialog>
    </>
  );
}

'use client';
import * as React from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle2, Check, Loader2, Lock, Printer, Save } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Field as FormField, Input, Select, Textarea } from '@/components/ui/input';
import { useConfirm } from '@/components/ui/confirm';
import { allFields, computeScores, isVisible, progress } from '@/lib/evaluation/engine';
import type { Answers, FormTemplate } from '@/lib/evaluation/types';
import { saveEvaluationForm } from '@/lib/actions/evaluation';
import { FieldControl } from './fields';
import { ScoreCards } from './score-cards';
import { cn } from '@/lib/utils';

type Props = {
  template: FormTemplate;
  patient: { id: string; name: string; sex: string | null; age: number | null };
  staff: { id: string; name: string }[];
  initial?: { id: string; answers: Answers; assessed_on: string; staff_id: string | null; conclusion: string | null; next_assessment_on: string | null };
  defaultStaffId: string | null;
  today: string;
  canFinalize: boolean;
};

const SPAN = { 1: 'sm:col-span-1', 2: 'sm:col-span-2', 3: 'sm:col-span-3', 4: 'sm:col-span-4' } as const;

export function FormRunner({ template, patient, staff, initial, defaultStaffId, today, canFinalize }: Props) {
  const router = useRouter();
  const confirm = useConfirm();
  const [id, setId] = React.useState<string | null>(initial?.id ?? null);
  const [a, setA] = React.useState<Answers>(initial?.answers ?? {});
  const [meta, setMeta] = React.useState({ assessed_on: initial?.assessed_on ?? today, staff_id: initial?.staff_id ?? defaultStaffId ?? '', conclusion: initial?.conclusion ?? '', next_assessment_on: initial?.next_assessment_on ?? '' });
  const [dirty, setDirty] = React.useState(false);
  const [saving, setSaving] = React.useState<'idle' | 'saving' | 'saved' | 'error'>(initial ? 'saved' : 'idle');
  const [active, setActive] = React.useState(template.sections[0]?.id);
  const fields = React.useMemo(() => allFields(template), [template]);
  const scores = React.useMemo(() => computeScores(template, a, { sex: patient.sex, age: patient.age, date: meta.assessed_on }), [template, a, patient, meta.assessed_on]);
  const prog = progress(template, a);

  const set = React.useCallback((k: string, v: unknown) => { setA((s) => ({ ...s, [k]: v })); setDirty(true); }, []);

  const save = React.useCallback(async (finalize = false, silent = false) => {
    setSaving('saving');
    const r = await saveEvaluationForm(id, { patient_id: patient.id, form_key: template.key, answers: a, ...meta, finalize });
    if (!r.ok) { setSaving('error'); if (!silent) toast.error(r.error); return false; }
    const newId = (r.data as { id: string }).id;
    setDirty(false); setSaving('saved');
    if (finalize) { toast.success('Avaliação finalizada e assinada.'); router.push(`/app/avaliacoes/${newId}`); return true; }
    if (!id) { setId(newId); window.history.replaceState(null, '', `/app/avaliacoes/${newId}`); }
    if (!silent) toast.success('Rascunho salvo.');
    return true;
  }, [id, patient.id, template.key, a, meta, router]);

  // salvamento automático (rascunho) 4 s após a última alteração
  React.useEffect(() => {
    if (!dirty) return;
    const t = setTimeout(() => { save(false, true); }, 4000);
    return () => clearTimeout(t);
  }, [dirty, a, meta, save]);
  React.useEffect(() => {
    const h = (e: BeforeUnloadEvent) => { if (dirty) { e.preventDefault(); e.returnValue = ''; } };
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, [dirty]);

  // seção visível destacada no índice
  React.useEffect(() => {
    const els = template.sections.map((s) => document.getElementById(`sec-${s.id}`)).filter(Boolean) as HTMLElement[];
    const obs = new IntersectionObserver((ents) => { const v = ents.filter((e) => e.isIntersecting).sort((x, y) => x.boundingClientRect.top - y.boundingClientRect.top)[0]; if (v) setActive(v.target.id.slice(4)); }, { rootMargin: '-20% 0px -70% 0px' });
    els.forEach((e) => obs.observe(e));
    return () => obs.disconnect();
  }, [template.sections]);

  const secProgress = (sid: string) => {
    const s = template.sections.find((x) => x.id === sid)!;
    const fs = s.fields.filter((f) => f.type !== 'computed' && f.type !== 'info' && isVisible(f, a));
    const done = fs.filter((f) => { const v = a[f.id]; return v !== undefined && v !== '' && !(Array.isArray(v) && !v.length) && !(typeof v === 'object' && v !== null && !Array.isArray(v) && !Object.keys(v).length); }).length;
    return { done, total: fs.length };
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[240px_1fr]">
      <aside className="hidden lg:block">
        <nav aria-label="Seções da ficha" className="sticky top-20 space-y-1">
          <div className="mb-3 rounded-lg border bg-card p-3">
            <div className="flex items-center justify-between text-xs text-muted-foreground"><span>Preenchimento</span><span className="font-medium text-foreground">{prog.pct}%</span></div>
            <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary transition-all" style={{ width: `${prog.pct}%` }} /></div>
            <p className="mt-2 flex items-center gap-1 text-xs text-muted-foreground">
              {saving === 'saving' ? <><Loader2 className="h-3 w-3 animate-spin" />Salvando…</> : saving === 'saved' && !dirty ? <><Check className="h-3 w-3 text-success" />Rascunho salvo</> : saving === 'error' ? <span className="text-destructive">Não salvo — verifique</span> : dirty ? 'Alterações não salvas' : 'Ainda não salvo'}
            </p>
          </div>
          {template.sections.map((s, i) => {
            const p = secProgress(s.id);
            return (
              <a key={s.id} href={`#sec-${s.id}`} className={cn('flex items-center justify-between gap-2 rounded-md px-2.5 py-1.5 text-sm', active === s.id ? 'bg-primary-soft font-medium text-primary' : 'text-muted-foreground hover:bg-muted hover:text-foreground')}>
                <span className="truncate">{i + 1}. {s.title}</span>
                {p.total > 0 && (p.done === p.total ? <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-success" /> : <span className="shrink-0 text-[11px] tabular-nums">{p.done}/{p.total}</span>)}
              </a>
            );
          })}
        </nav>
      </aside>

      <div className="min-w-0 space-y-6">
        <div className="rounded-xl border bg-card p-4 shadow-soft">
          <div className="grid gap-4 sm:grid-cols-3">
            <FormField label="Data da avaliação" htmlFor="ev-date" required><Input id="ev-date" type="date" value={meta.assessed_on} max={today} onChange={(e) => { setMeta({ ...meta, assessed_on: e.target.value }); setDirty(true); }} /></FormField>
            <FormField label="Avaliador" htmlFor="ev-staff">
              <Select id="ev-staff" value={meta.staff_id} onChange={(e) => { setMeta({ ...meta, staff_id: e.target.value }); setDirty(true); }}>
                <option value="">—</option>{staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </Select>
            </FormField>
            <div className="text-sm"><p className="text-muted-foreground">Aluno</p><p className="font-medium">{patient.name}</p><p className="text-xs text-muted-foreground">{[patient.age !== null ? `${patient.age} anos` : null, patient.sex === 'female' ? 'Feminino' : patient.sex === 'male' ? 'Masculino' : null].filter(Boolean).join(' · ')}</p></div>
          </div>
        </div>

        {template.summary && template.summary.length > 0 && (
          <div className="sticky top-16 z-10 -mx-1 rounded-xl bg-background/90 px-1 py-2 backdrop-blur">
            <ScoreCards ids={template.summary} fields={fields} scores={scores} />
          </div>
        )}

        {template.sections.map((s, i) => (
          <section key={s.id} id={`sec-${s.id}`} className="scroll-mt-40 rounded-xl border bg-card shadow-soft">
            <header className="border-b px-5 py-3">
              <h2 className="font-display text-lg"><span className="mr-2 text-primary">{i + 1}.</span>{s.title}</h2>
              {s.description && <p className="text-sm text-muted-foreground">{s.description}</p>}
            </header>
            <div className="grid gap-x-5 gap-y-5 p-5 sm:grid-cols-4">
              {s.fields.filter((f) => isVisible(f, a)).map((f) => (
                <div key={f.id} className={cn('col-span-1', SPAN[f.span ?? (f.type === 'number' || f.type === 'date' || f.type === 'bp' ? 1 : 4)])}>
                  <FieldControl f={f} a={a} set={set} score={scores[f.id]} />
                </div>
              ))}
            </div>
          </section>
        ))}

        <section className="rounded-xl border bg-card p-5 shadow-soft">
          <h2 className="font-display text-lg">Conclusão da avaliação</h2>
          <div className="mt-3 grid gap-4 sm:grid-cols-4">
            <div className="sm:col-span-3"><FormField label="Síntese / conclusão geral" htmlFor="ev-conc"><Textarea id="ev-conc" rows={3} value={meta.conclusion} onChange={(e) => { setMeta({ ...meta, conclusion: e.target.value }); setDirty(true); }} /></FormField></div>
            <FormField label="Próxima avaliação" htmlFor="ev-next"><Input id="ev-next" type="date" value={meta.next_assessment_on} min={meta.assessed_on} onChange={(e) => { setMeta({ ...meta, next_assessment_on: e.target.value }); setDirty(true); }} /></FormField>
          </div>
          {template.references && template.references.length > 0 && <p className="mt-4 text-xs text-muted-foreground">Referências: {template.references.join(' ')}</p>}
        </section>

        <div className="sticky bottom-0 z-10 -mx-4 flex flex-wrap items-center justify-end gap-2 border-t bg-background/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6">
          <span className="mr-auto text-xs text-muted-foreground">{prog.done} de {prog.total} itens preenchidos</span>
          {id && <a href={`/imprimir/ficha/${id}`} target="_blank" rel="noopener"><Button variant="ghost"><Printer />Imprimir</Button></a>}
          <Button variant="outline" loading={saving === 'saving'} onClick={() => save(false)}><Save />Salvar rascunho</Button>
          {canFinalize && (
            <Button onClick={async () => {
              const { confirmed } = await confirm({ title: 'Finalizar e assinar a avaliação?', description: 'Depois de finalizada, a ficha não pode mais ser alterada (registro clínico). Correções serão feitas por nova avaliação ou observação no prontuário.', confirmLabel: 'Finalizar e assinar' });
              if (confirmed) await save(true);
            }}><Lock />Finalizar e assinar</Button>
          )}
        </div>
      </div>
    </div>
  );
}

'use client';
import * as React from 'react';
import { Button } from '@/components/ui/button';
import { Field, Input, Select, Textarea, Checkbox } from '@/components/ui/input';
import { cn } from '@/lib/utils';

export type Question = { id: string; section?: string | null; label: string; help_text?: string | null; type: string; options?: string[]; scale_min?: number | null; scale_max?: number | null; required?: boolean };

/** Formulário de anamnese configurável (texto, sim/não, número, data, seleção, múltipla escolha, escala, assinatura). */
export function AnamnesisForm({ questions, onSubmit, submitLabel = 'Enviar respostas', askSignature = true }: { questions: Question[]; onSubmit: (answers: Record<string, unknown>, signature: string) => Promise<boolean>; submitLabel?: string; askSignature?: boolean }) {
  const [a, setA] = React.useState<Record<string, unknown>>({});
  const [sig, setSig] = React.useState('');
  const [pending, setPending] = React.useState(false);
  const [missing, setMissing] = React.useState<string[]>([]);
  const sections = Array.from(new Set(questions.map((q) => q.section ?? '')));
  const set = (id: string, v: unknown) => setA((o) => ({ ...o, [id]: v }));
  const submit = async () => {
    const miss = questions.filter((q) => q.required && (a[q.id] === undefined || a[q.id] === '' || (Array.isArray(a[q.id]) && !(a[q.id] as unknown[]).length))).map((q) => q.id);
    setMissing(miss);
    if (miss.length) { document.getElementById(`q-${miss[0]}`)?.focus(); return; }
    setPending(true);
    await onSubmit(a, sig);
    setPending(false);
  };
  return (
    <form className="space-y-8" onSubmit={(e) => { e.preventDefault(); submit(); }}>
      {sections.map((s) => (
        <fieldset key={s} className="space-y-5">
          {s && <legend className="mb-1 font-display text-lg">{s}</legend>}
          {questions.filter((q) => (q.section ?? '') === s).map((q) => {
            const err = missing.includes(q.id) ? 'Resposta obrigatória.' : undefined;
            const id = `q-${q.id}`;
            let input: React.ReactNode;
            switch (q.type) {
              case 'textarea': input = <Textarea id={id} value={String(a[q.id] ?? '')} onChange={(e) => set(q.id, e.target.value)} />; break;
              case 'number': input = <Input id={id} type="number" value={String(a[q.id] ?? '')} onChange={(e) => set(q.id, e.target.value === '' ? '' : Number(e.target.value))} />; break;
              case 'date': input = <Input id={id} type="date" value={String(a[q.id] ?? '')} onChange={(e) => set(q.id, e.target.value)} />; break;
              case 'yes_no': input = (
                <div className="flex gap-2" role="radiogroup" aria-labelledby={`${id}-l`}>
                  {[['Sim', true], ['Não', false]].map(([l, v]) => (
                    <button key={String(l)} id={v === true ? id : undefined} type="button" role="radio" aria-checked={a[q.id] === v} onClick={() => set(q.id, v)}
                      className={cn('h-10 min-w-20 rounded-lg border px-4 text-sm', a[q.id] === v ? 'border-primary bg-primary text-primary-foreground' : 'hover:bg-muted')}>{l as string}</button>
                  ))}
                </div>
              ); break;
              case 'select': input = <Select id={id} value={String(a[q.id] ?? '')} onChange={(e) => set(q.id, e.target.value)}><option value="">Selecione…</option>{(q.options ?? []).map((o) => <option key={o}>{o}</option>)}</Select>; break;
              case 'multi_select': {
                const sel = (a[q.id] as string[]) ?? [];
                input = <div className="flex flex-wrap gap-2">{(q.options ?? []).map((o) => <Checkbox key={o} checked={sel.includes(o)} onChange={(e) => set(q.id, e.target.checked ? [...sel, o] : sel.filter((x) => x !== o))} label={o} className="rounded-full border px-3" />)}</div>;
                break;
              }
              case 'scale': {
                const min = q.scale_min ?? 0, max = q.scale_max ?? 10;
                input = (
                  <div className="flex flex-wrap gap-1" role="radiogroup">
                    {Array.from({ length: max - min + 1 }, (_, i) => min + i).map((n) => (
                      <button key={n} id={n === min ? id : undefined} type="button" role="radio" aria-checked={a[q.id] === n} onClick={() => set(q.id, n)}
                        className={cn('h-10 w-10 rounded-lg border text-sm', a[q.id] === n ? 'border-primary bg-primary text-primary-foreground' : 'hover:bg-muted')}>{n}</button>
                    ))}
                  </div>
                );
                break;
              }
              case 'signature': input = <Input id={id} value={String(a[q.id] ?? '')} onChange={(e) => set(q.id, e.target.value)} placeholder="Digite seu nome completo" />; break;
              default: input = <Input id={id} value={String(a[q.id] ?? '')} onChange={(e) => set(q.id, e.target.value)} />;
            }
            return <Field key={q.id} label={<span id={`${id}-l`}>{q.label}</span>} htmlFor={id} required={q.required} hint={q.help_text ?? undefined} error={err}>{input}</Field>;
          })}
        </fieldset>
      ))}
      {askSignature && <Field label="Nome completo (assinatura)" htmlFor="q-sig" required><Input id="q-sig" value={sig} onChange={(e) => setSig(e.target.value)} required /></Field>}
      {missing.length > 0 && <p role="alert" className="text-sm text-destructive">Responda as perguntas obrigatórias destacadas.</p>}
      <Button type="submit" loading={pending}>{submitLabel}</Button>
    </form>
  );
}

export function AnamnesisView({ questions, answers }: { questions: Question[]; answers: Record<string, unknown> }) {
  const fmt = (v: unknown) => (v === true ? 'Sim' : v === false ? 'Não' : Array.isArray(v) ? v.join(', ') : v === undefined || v === null || v === '' ? '—' : String(v));
  return (
    <dl className="space-y-3">
      {questions.map((q) => (
        <div key={q.id} className="border-b pb-2">
          <dt className="text-sm text-muted-foreground">{q.label}</dt>
          <dd className="whitespace-pre-wrap">{fmt(answers?.[q.id])}</dd>
        </div>
      ))}
    </dl>
  );
}

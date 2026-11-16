import type { Answers, FormTemplate, Scores } from '@/lib/evaluation/types';
import { allFields, answerText, hasValue, isVisible } from '@/lib/evaluation/engine';
import { ScoreCards, TONE } from './score-cards';
import { cn } from '@/lib/utils';

/** Visualização somente leitura de uma ficha preenchida (mostra só o que foi respondido). */
export function FormView({ template, answers, scores, showEmpty = false }: { template: FormTemplate; answers: Answers; scores: Scores; showEmpty?: boolean }) {
  const fields = allFields(template);
  return (
    <div className="space-y-5">
      {template.summary && template.summary.length > 0 && <ScoreCards ids={template.summary} fields={fields} scores={scores} />}
      {template.sections.map((s, i) => {
        const items = s.fields.filter((f) => f.type !== 'info' && isVisible(f, answers)).filter((f) => showEmpty || (f.type === 'computed' ? scores[f.id]?.value !== null && scores[f.id] !== undefined : hasValue(answers[f.id]) || hasValue(answers[`${f.id}__other`])));
        if (!items.length) return null;
        return (
          <section key={s.id} className="rounded-xl border bg-card">
            <h3 className="border-b px-4 py-2.5 font-medium"><span className="mr-1.5 text-primary">{i + 1}.</span>{s.title}</h3>
            <dl className="grid gap-x-6 gap-y-3 p-4 sm:grid-cols-2">
              {items.map((f) => {
                if (f.type === 'grid') {
                  const g = f.grid!; const o = (answers[f.id] ?? {}) as Record<string, Record<string, unknown>>;
                  const rows = g.rows.filter((r) => o[r.id] && Object.keys(o[r.id]).length);
                  return (
                    <div key={f.id} className="sm:col-span-2">
                      <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{f.label}</dt>
                      <dd className="mt-1 overflow-x-auto">
                        <table className="text-sm"><thead><tr><th />{g.columns.map((c) => <th key={c.id} className="px-3 py-1 text-left text-xs font-medium text-muted-foreground">{c.label}</th>)}</tr></thead>
                          <tbody>{rows.map((r) => <tr key={r.id} className="border-t"><td className="py-1 pr-4">{r.label}</td>{g.columns.map((c) => { const x = o[r.id]?.[c.id]; return <td key={c.id} className="px-3 py-1 tabular-nums">{x === undefined ? '—' : g.cell.options?.find((op) => op.value === x)?.label ?? `${String(x).replace('.', ',')}${g.cell.unit ? ` ${g.cell.unit}` : ''}`}</td>; })}</tr>)}</tbody>
                        </table>
                      </dd>
                    </div>
                  );
                }
                if (f.type === 'computed') {
                  const sc = scores[f.id];
                  return (
                    <div key={f.id} className={cn('rounded-lg border px-3 py-2', sc?.band?.tone ? TONE[sc.band.tone] : 'border-primary/30 bg-primary-soft/40')}>
                      <dt className="text-xs font-medium text-muted-foreground">{f.label}</dt>
                      <dd className="font-semibold text-foreground">{sc?.text ?? '—'}{sc?.band && <span className="ml-2 text-xs font-medium">{sc.band.label}</span>}</dd>
                    </div>
                  );
                }
                const txt = answerText(f, answers);
                return (
                  <div key={f.id} className={cn(f.type === 'textarea' || (f.span ?? 4) >= 3 ? 'sm:col-span-2' : '')}>
                    <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{f.label}</dt>
                    <dd className="whitespace-pre-wrap text-sm">{txt || <span className="text-muted-foreground">—</span>}</dd>
                  </div>
                );
              })}
            </dl>
          </section>
        );
      })}
    </div>
  );
}

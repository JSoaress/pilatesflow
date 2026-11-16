import type { Answers, Field, FormTemplate, Scores } from '@/lib/evaluation/types';
import { answerText, hasValue, isVisible } from '@/lib/evaluation/engine';

const Box = ({ checked }: { checked?: boolean }) => (
  <span className="mr-1 inline-flex h-[3.2mm] w-[3.2mm] shrink-0 translate-y-[0.4mm] items-center justify-center border border-black text-[7pt] leading-none">{checked ? '✕' : ''}</span>
);
const Line = ({ w = '100%' }: { w?: string }) => <span className="inline-block border-b border-neutral-500 align-bottom" style={{ width: w, height: '5mm' }} />;

function computedHint(f: Field): string {
  const c = f.compute;
  if (!c) return '';
  switch (c.kind) {
    case 'bmi': return 'peso ÷ altura²';
    case 'sum': return 'soma dos itens';
    case 'count': return 'nº de itens marcados';
    case 'avg': return 'média das medidas';
    case 'bilateral_diff': return '|direito − esquerdo|';
    case 'ratio': return `${String(c.numerator).replace('.', ',')} ÷ tempo`;
    default: return '';
  }
}

/** Campo em BRANCO para preencher à mão. */
function BlankField({ f }: { f: Field }) {
  const opts = f.options ?? [];
  switch (f.type) {
    case 'info': return <p className="text-[9pt] font-semibold">{f.label}{f.help && <span className="font-normal text-neutral-600"> — {f.help}</span>}</p>;
    case 'textarea': return <div><p className="text-[9pt] font-medium">{f.label}</p>{Array.from({ length: f.lines ?? 3 }).map((_, i) => <div key={i} className="h-[6.5mm] border-b border-neutral-400" />)}</div>;
    case 'yesno': return <p className="text-[9pt]"><span className="font-medium">{f.label}</span> <Box />Sim <Box />Não{f.detail && <> &nbsp;{f.detail.label ?? 'Especificar'}: <Line w="45mm" /></>}</p>;
    case 'single': case 'multi': return (
      <div className="text-[9pt]"><span className="font-medium">{f.label}{f.type === 'multi' ? ' (marque todos que se aplicam)' : ''}</span>
        <div className="mt-0.5 flex flex-wrap gap-x-4 gap-y-0.5">{opts.map((o) => <span key={o.value} className="inline-flex"><Box />{o.label}</span>)}{f.other && <span className="inline-flex"><Box />Outro: <Line w="35mm" /></span>}</div>
        {f.detail && <p className="mt-0.5">{f.detail.label ?? 'Especificar'}: <Line w="80%" /></p>}
      </div>
    );
    case 'scale': return <div className="text-[9pt]"><span className="font-medium">{f.label}</span><div className="mt-1 flex gap-1">{opts.map((o) => <span key={o.value} className="flex h-[6mm] w-[6mm] items-center justify-center rounded-full border border-black text-[8pt]">{o.label}</span>)}</div></div>;
    case 'bilateral': {
      const [l1, l2] = f.bilateral?.sides ?? ['Direito', 'Esquerdo'];
      const c = f.bilateral!.cell;
      if (c.type === 'single' || c.type === 'multi') return (
        <div className="text-[9pt]"><span className="font-medium">{f.label}</span>
          {[l1, l2].map((side) => <div key={side} className="mt-0.5 flex flex-wrap gap-x-3"><span className="w-[16mm] font-medium">{side}:</span>{c.options?.map((o) => <span key={o.value} className="inline-flex"><Box />{o.label}</span>)}</div>)}
        </div>
      );
      return <p className="text-[9pt]"><span className="font-medium">{f.label}</span> — {l1}: <Line w="22mm" /> {c.unit} &nbsp; {l2}: <Line w="22mm" /> {c.unit}</p>;
    }
    case 'grid': {
      const g = f.grid!;
      return (
        <div className="text-[9pt]"><p className="font-medium">{f.label}</p>
          <table className="mt-1 w-full border-collapse text-[8.5pt]">
            <thead><tr><th className="border border-neutral-500 px-1 py-0.5 text-left" />{g.columns.map((c) => <th key={c.id} className="border border-neutral-500 px-1 py-0.5 text-left font-medium">{c.label}</th>)}</tr></thead>
            <tbody>{g.rows.map((r) => <tr key={r.id}><td className="border border-neutral-500 px-1 py-0.5">{r.label}</td>{g.columns.map((c) => <td key={c.id} className="h-[6mm] border border-neutral-500" />)}</tr>)}</tbody>
          </table>
          {g.cell.type === 'single' && g.cell.options && <p className="mt-0.5 text-[7.5pt] text-neutral-600">Opções: {g.cell.options.map((o) => o.label).join(' · ')}</p>}
        </div>
      );
    }
    case 'computed': return <p className="text-[9pt]"><span className="font-medium">{f.label}:</span> <Line w="28mm" /> {f.unit}{computedHint(f) && <span className="text-[7.5pt] text-neutral-600"> ({computedHint(f)})</span>}{f.bands && <span className="block text-[7.5pt] text-neutral-600">{f.bands.map((b) => `${b.min !== undefined ? `≥ ${String(b.min).replace('.', ',')}` : ''}${b.min !== undefined && b.max !== undefined ? ' e ' : ''}${b.max !== undefined ? `≤ ${String(b.max).replace('.', ',')}` : ''}: ${b.label}`).join(' | ')}</span>}</p>;
    case 'number': case 'bp': return <p className="text-[9pt]"><span className="font-medium">{f.label}:</span> <Line w="22mm" /> {f.unit}</p>;
    case 'date': return <p className="text-[9pt]"><span className="font-medium">{f.label}:</span> ____/____/______</p>;
    default: return <p className="text-[9pt]"><span className="font-medium">{f.label}:</span> <Line w="70%" /></p>;
  }
}

/** Campo PREENCHIDO para impressão. */
function FilledField({ f, a, s }: { f: Field; a: Answers; s: Scores }) {
  if (f.type === 'grid') {
    const g = f.grid!; const o = (a[f.id] ?? {}) as Record<string, Record<string, unknown>>;
    const rows = g.rows.filter((r) => o[r.id] && Object.keys(o[r.id]).length);
    return (
      <div className="avoid-break"><p className="text-[8pt] font-medium uppercase tracking-wide text-neutral-500">{f.label}</p>
        <table className="mt-0.5 border-collapse text-[9pt]"><thead><tr><th className="border border-neutral-300 px-1.5 py-0.5" />{g.columns.map((c) => <th key={c.id} className="border border-neutral-300 px-1.5 py-0.5 text-left font-medium">{c.label}</th>)}</tr></thead>
          <tbody>{rows.map((r) => <tr key={r.id}><td className="border border-neutral-300 px-1.5 py-0.5">{r.label}</td>{g.columns.map((c) => { const x = o[r.id]?.[c.id]; return <td key={c.id} className="border border-neutral-300 px-1.5 py-0.5 tabular-nums">{x === undefined ? '' : g.cell.options?.find((op) => op.value === x)?.label ?? `${String(x).replace('.', ',')}${g.cell.unit ? ` ${g.cell.unit}` : ''}`}</td>; })}</tr>)}</tbody>
        </table>
      </div>
    );
  }
  if (f.type === 'computed') {
    const sc = s[f.id];
    return <p className="avoid-break text-[9.5pt]"><span className="text-[8pt] font-medium uppercase tracking-wide text-neutral-500">{f.label}: </span><strong>{sc?.text ?? '—'}</strong>{sc?.band && <span> — {sc.band.label}</span>}</p>;
  }
  return (
    <div className="avoid-break">
      <p className="text-[8pt] font-medium uppercase tracking-wide text-neutral-500">{f.label}</p>
      <p className="whitespace-pre-wrap text-[9.5pt]">{answerText(f, a)}</p>
    </div>
  );
}

export function PrintFormBody({ template, answers = {}, scores = {}, blank, showEmpty }: { template: FormTemplate; answers?: Answers; scores?: Scores; blank?: boolean; showEmpty?: boolean }) {
  return (
    <div className="space-y-4">
      {!blank && template.summary && template.summary.some((id) => scores[id]?.value !== null && scores[id]) && (
        <div className="grid grid-cols-2 gap-2 rounded border border-neutral-300 p-2 sm:grid-cols-4 print:grid-cols-4">
          {template.summary.map((id) => { const f = template.sections.flatMap((x) => x.fields).find((x) => x.id === id); const sc = scores[id]; if (!f || !sc || sc.value === null) return null; return (
            <div key={id} className="text-[8.5pt]"><p className="text-neutral-500">{f.label}</p><p className="text-[11pt] font-semibold">{sc.text}</p>{sc.band && <p>{sc.band.label}</p>}</div>
          ); })}
        </div>
      )}
      {template.sections.map((s, i) => {
        const fields = blank ? s.fields : s.fields.filter((f) => f.type !== 'info' && isVisible(f, answers) && (showEmpty || (f.type === 'computed' ? scores[f.id] && scores[f.id].value !== null : hasValue(answers[f.id]) || hasValue(answers[`${f.id}__other`]))));
        if (!fields.length) return null;
        return (
          <section key={s.id} className="break-inside-auto">
            <h2 className="mb-1.5 border-b border-[#2F6B5A] pb-0.5 text-[10.5pt] font-semibold uppercase tracking-wide text-[#2F6B5A]">{String.fromCharCode(65 + i)}. {s.title}</h2>
            {blank && s.description && <p className="mb-1 text-[8pt] italic text-neutral-600">{s.description}</p>}
            <div className={blank ? 'space-y-2' : 'grid grid-cols-2 gap-x-6 gap-y-2'}>
              {fields.map((f) => blank
                ? <div key={f.id} className="avoid-break"><BlankField f={f} /></div>
                : <div key={f.id} className={f.type === 'textarea' || f.type === 'grid' || (f.span ?? 4) >= 3 ? 'col-span-2' : ''}><FilledField f={f} a={answers} s={scores} /></div>)}
            </div>
          </section>
        );
      })}
      {template.references && template.references.length > 0 && <p className="text-[7.5pt] text-neutral-500">Referências: {template.references.join(' ')}</p>}
    </div>
  );
}

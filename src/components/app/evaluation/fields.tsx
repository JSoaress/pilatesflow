'use client';
import * as React from 'react';
import type { Answers, CellSpec, Field, Opt, ScoreResult } from '@/lib/evaluation/types';
import { Input, Textarea, Select } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { TONE } from './score-cards';

type Set = (id: string, v: unknown) => void;

function Chip({ active, onClick, children, tone }: { active: boolean; onClick: () => void; children: React.ReactNode; tone?: 'yes' | 'no' }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={active}
      className={cn('min-h-9 rounded-lg border px-3 py-1.5 text-left text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        active ? (tone === 'no' ? 'border-foreground/40 bg-muted font-medium' : 'border-primary bg-primary text-primary-foreground') : 'bg-background hover:border-primary/60 hover:bg-primary-soft/40')}>
      {children}
    </button>
  );
}

function Choices({ options, value, onChange, multi }: { options: Opt[]; value: unknown; onChange: (v: unknown) => void; multi?: boolean }) {
  const arr = Array.isArray(value) ? (value as string[]) : [];
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((o) => {
        const active = multi ? arr.includes(o.value) : value === o.value;
        return (
          <Chip key={o.value} active={active} onClick={() => multi ? onChange(active ? arr.filter((x) => x !== o.value) : [...arr, o.value]) : onChange(active ? undefined : o.value)}>
            {o.label}
          </Chip>
        );
      })}
    </div>
  );
}

function Cell({ spec, value, onChange, label }: { spec: CellSpec; value: unknown; onChange: (v: unknown) => void; label: string }) {
  if (spec.type === 'single') return (
    <Select aria-label={label} value={String(value ?? '')} onChange={(e) => onChange(e.target.value || undefined)} className="h-9 min-w-[7rem]">
      <option value="">—</option>
      {spec.options?.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </Select>
  );
  return (
    <div className="relative">
      <Input aria-label={label} type={spec.type === 'date' ? 'date' : 'text'} inputMode={spec.type === 'number' ? 'decimal' : undefined} value={String(value ?? '')} onChange={(e) => onChange(e.target.value)} className={cn('h-9', spec.unit && 'pr-9')} />
      {spec.unit && <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">{spec.unit}</span>}
    </div>
  );
}

export function FieldControl({ f, a, set, score }: { f: Field; a: Answers; set: Set; score?: ScoreResult }) {
  const v = a[f.id];
  const id = `ev-${f.id}`;
  const detailOn = f.detail && (Array.isArray(v) ? v.some((x) => f.detail!.when.includes(String(x))) : f.detail.when.includes(String(v)));

  if (f.type === 'info') return (
    <div className="rounded-lg border-l-4 border-primary/60 bg-primary-soft/30 px-3 py-2">
      <p className="text-sm font-medium">{f.label}</p>
      {f.help && <p className="text-xs text-muted-foreground">{f.help}</p>}
    </div>
  );

  if (f.type === 'computed') {
    const tone = score?.band?.tone;
    const empty = !score || score.value === null;
    return (
      <div className={cn('rounded-lg border px-3 py-2', empty ? TONE.none : tone ? TONE[tone] : 'border-primary/30 bg-primary-soft/40')}>
        <p className="text-xs font-medium text-muted-foreground">{f.label} <span className="font-normal">(automático)</span></p>
        <p className="text-base font-semibold text-foreground">{empty ? (score?.text && score.text !== '—' ? <span className="text-sm font-normal text-muted-foreground">{score.text}</span> : '—') : score!.text}</p>
        {!empty && score!.band && <p className="text-xs font-medium">{score!.band.label}</p>}
        {f.help && <p className="mt-0.5 text-[11px] text-muted-foreground">{f.help}</p>}
      </div>
    );
  }

  const label = (
    <label htmlFor={['text', 'textarea', 'number', 'date', 'bp'].includes(f.type) ? id : undefined} className="mb-1.5 block text-sm font-medium leading-snug">
      {f.label}{f.unit && f.type !== 'number' && f.type !== 'bp' ? <span className="font-normal text-muted-foreground"> ({f.unit})</span> : null}
    </label>
  );

  let control: React.ReactNode = null;
  switch (f.type) {
    case 'text': control = <Input id={id} value={String(v ?? '')} onChange={(e) => set(f.id, e.target.value)} maxLength={500} />; break;
    case 'textarea': control = <Textarea id={id} rows={Math.min(8, Math.max(2, f.lines ?? 3))} value={String(v ?? '')} onChange={(e) => set(f.id, e.target.value)} maxLength={8000} />; break;
    case 'number': case 'bp': control = (
      <div className="relative">
        <Input id={id} inputMode={f.type === 'bp' ? 'numeric' : 'decimal'} placeholder={f.type === 'bp' ? '120/80' : undefined} value={String(v ?? '')} onChange={(e) => set(f.id, e.target.value)} className={cn(f.unit && 'pr-14')} />
        {f.unit && <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">{f.unit}</span>}
      </div>
    ); break;
    case 'date': control = <Input id={id} type="date" value={String(v ?? '')} onChange={(e) => set(f.id, e.target.value)} />; break;
    case 'yesno': control = (
      <div className="flex gap-1.5">
        <Chip active={v === 'yes'} onClick={() => set(f.id, v === 'yes' ? undefined : 'yes')}>Sim</Chip>
        <Chip active={v === 'no'} tone="no" onClick={() => set(f.id, v === 'no' ? undefined : 'no')}>Não</Chip>
      </div>
    ); break;
    case 'single': control = <Choices options={f.options ?? []} value={v} onChange={(x) => set(f.id, x)} />; break;
    case 'multi': control = <Choices multi options={f.options ?? []} value={v} onChange={(x) => set(f.id, x)} />; break;
    case 'scale': {
      const n = v === undefined ? null : Number(v);
      control = (
        <div className="flex flex-wrap gap-1">
          {(f.options ?? []).map((o) => {
            const val = Number(o.value);
            const hue = f.max ? 140 - (val / f.max) * 140 : 140;
            const active = n === val;
            return (
              <button key={o.value} type="button" aria-pressed={active} onClick={() => set(f.id, active ? undefined : o.value)}
                className={cn('h-10 w-10 rounded-lg border text-sm font-semibold transition-transform', active ? 'scale-110 text-white shadow' : 'hover:scale-105')}
                style={active ? { background: `hsl(${hue} 60% 42%)`, borderColor: `hsl(${hue} 60% 35%)` } : { borderColor: `hsl(${hue} 50% 70%)` }}>
                {o.label}
              </button>
            );
          })}
        </div>
      );
      break;
    }
    case 'bilateral': {
      const o = (v ?? {}) as Record<string, unknown>;
      const [l1, l2] = f.bilateral?.sides ?? ['Direito', 'Esquerdo'];
      const cell = f.bilateral!.cell;
      const upd = (k: 'd' | 'e', x: unknown) => set(f.id, { ...o, [k]: x });
      control = (cell.type === 'multi' || (cell.type === 'single' && (cell.options?.length ?? 0) <= 7)) ? (
        <div className="grid gap-3 md:grid-cols-2">
          {(['d', 'e'] as const).map((k, i) => (
            <div key={k} className="rounded-lg border bg-muted/20 p-2.5">
              <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{i ? l2 : l1}</p>
              <Choices multi={cell.type === 'multi'} options={cell.options ?? []} value={o[k]} onChange={(x) => upd(k, x)} />
            </div>
          ))}
        </div>
      ) : (
        <div className="grid max-w-md grid-cols-2 gap-3">
          {(['d', 'e'] as const).map((k, i) => <div key={k}><p className="mb-1 text-xs text-muted-foreground">{i ? l2 : l1}</p><Cell spec={cell} value={o[k]} onChange={(x) => upd(k, x)} label={`${f.label} — ${i ? l2 : l1}`} /></div>)}
        </div>
      );
      break;
    }
    case 'grid': {
      const g = f.grid!;
      const o = (v ?? {}) as Record<string, Record<string, unknown>>;
      control = (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50"><tr><th className="px-3 py-2 text-left font-medium" />{g.columns.map((c) => <th key={c.id} className="px-2 py-2 text-left font-medium">{c.label}</th>)}</tr></thead>
            <tbody>
              {g.rows.map((r) => (
                <tr key={r.id} className="border-t">
                  <td className="whitespace-nowrap px-3 py-1.5">{r.label}</td>
                  {g.columns.map((c) => (
                    <td key={c.id} className="px-2 py-1.5">
                      <Cell spec={g.cell} value={o[r.id]?.[c.id]} label={`${r.label} — ${c.label}`} onChange={(x) => set(f.id, { ...o, [r.id]: { ...(o[r.id] ?? {}), [c.id]: x } })} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
      break;
    }
  }

  return (
    <div>
      {label}
      {control}
      {f.other && (
        <Input aria-label={`${f.label} — outro`} placeholder="Outro (especificar)" className="mt-2 h-9" value={String(a[`${f.id}__other`] ?? '')} onChange={(e) => set(`${f.id}__other`, e.target.value)} />
      )}
      {detailOn && (
        <Input aria-label={`${f.label} — ${f.detail!.label ?? 'Especificar'}`} placeholder={f.detail!.label ?? 'Especificar'} className="mt-2 h-9" value={String(a[`${f.id}__det`] ?? '')} onChange={(e) => set(`${f.id}__det`, e.target.value)} />
      )}
      {f.help && <p className="mt-1 text-xs text-muted-foreground">{f.help}</p>}
    </div>
  );
}

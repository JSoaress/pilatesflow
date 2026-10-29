'use client';
import * as React from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Input, Select, Textarea, Checkbox } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { maskCPF, maskPhone, cn } from '@/lib/utils';
import { WEEKDAYS } from '@/lib/format';
import type { FieldDef, Option } from '@/lib/resources/types';

export function toInputValue(f: FieldDef, v: unknown, tz: string): string {
  if (v === null || v === undefined) return '';
  if (f.type === 'datetime' && typeof v === 'string') {
    const d = new Date(v);
    if (Number.isNaN(d.getTime())) return '';
    const parts = new Intl.DateTimeFormat('sv-SE', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).format(d);
    return parts.replace(' ', 'T').slice(0, 16);
  }
  if (Array.isArray(v)) return v.join(', ');
  return String(v);
}

/** Renderiza o controle adequado para cada tipo de campo. */
export function FieldInput({ f, value, onChange, options, tz, disabled, error }: {
  f: FieldDef; value: unknown; onChange: (v: unknown) => void; options?: Option[]; tz: string; disabled?: boolean; error?: string;
}) {
  const id = `f-${f.name}`;
  const common = { id, name: f.name, disabled, 'aria-invalid': error ? true : undefined, 'aria-describedby': error ? `${id}-error` : undefined, placeholder: f.placeholder, required: f.required };
  switch (f.type) {
    case 'textarea':
      return <Textarea {...common} value={String(value ?? '')} onChange={(e) => onChange(e.target.value)} rows={4} />;
    case 'richtext':
      return <Textarea {...common} value={String(value ?? '')} onChange={(e) => onChange(e.target.value)} rows={14} className="font-mono text-[13px]" />;
    case 'boolean':
      return <Checkbox id={id} name={f.name} checked={!!value} disabled={disabled} onChange={(e) => onChange(e.target.checked)} label={f.label} />;
    case 'select':
      return (
        <Select {...common} value={String(value ?? '')} onChange={(e) => onChange(e.target.value)}>
          {!f.required && <option value="">—</option>}
          {f.required && !value && <option value="">Selecione…</option>}
          {(f.options ?? []).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </Select>
      );
    case 'ref':
      return (
        <Select {...common} value={String(value ?? '')} onChange={(e) => onChange(e.target.value || null)}>
          <option value="">{f.required ? 'Selecione…' : '—'}</option>
          {(options ?? []).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </Select>
      );
    case 'multiref': {
      const sel = new Set((value as string[] | undefined) ?? []);
      return (
        <div className="flex flex-wrap gap-2 rounded-lg border p-2" role="group" aria-label={f.label}>
          {(options ?? []).length === 0 && <span className="text-sm text-muted-foreground">Nenhuma opção cadastrada.</span>}
          {(options ?? []).map((o) => (
            <label key={o.value} className={cn('cursor-pointer rounded-full border px-3 py-1 text-sm transition-colors', sel.has(o.value) ? 'border-primary bg-primary-soft text-primary' : 'hover:bg-muted')}>
              <input type="checkbox" className="sr-only" checked={sel.has(o.value)} disabled={disabled}
                onChange={(e) => { const n = new Set(sel); if (e.target.checked) n.add(o.value); else n.delete(o.value); onChange(Array.from(n)); }} />
              {o.label}
            </label>
          ))}
        </div>
      );
    }
    case 'money':
    case 'number':
    case 'percent':
      return <Input {...common} type="number" inputMode="decimal" step={f.type === 'number' ? 'any' : '0.01'} min={f.min} max={f.max} value={String(value ?? '')} onChange={(e) => onChange(e.target.value)} />;
    case 'int':
      return <Input {...common} type="number" inputMode="numeric" step="1" min={f.min} max={f.max} value={String(value ?? '')} onChange={(e) => onChange(e.target.value)} />;
    case 'date':
      return <Input {...common} type="date" value={String(value ?? '').slice(0, 10)} onChange={(e) => onChange(e.target.value)} />;
    case 'datetime':
      return <Input {...common} type="datetime-local" value={toInputValue(f, value, tz)} onChange={(e) => onChange(e.target.value)} />;
    case 'time':
      return <Input {...common} type="time" value={String(value ?? '').slice(0, 5)} onChange={(e) => onChange(e.target.value)} />;
    case 'color':
      return (
        <div className="flex items-center gap-2">
          <input id={id} type="color" value={String(value || '#3F6F5E')} onChange={(e) => onChange(e.target.value)} className="h-10 w-14 cursor-pointer rounded-lg border bg-card p-1" aria-label={f.label} />
          <span className="text-sm text-muted-foreground">{String(value || '')}</span>
        </div>
      );
    case 'cpf':
      return <Input {...common} inputMode="numeric" value={String(value ?? '')} onChange={(e) => onChange(maskCPF(e.target.value))} />;
    case 'phone':
      return <Input {...common} type="tel" inputMode="tel" value={String(value ?? '')} onChange={(e) => onChange(maskPhone(e.target.value))} />;
    case 'email':
      return <Input {...common} type="email" value={String(value ?? '')} onChange={(e) => onChange(e.target.value)} />;
    case 'url':
      return <Input {...common} type="url" value={String(value ?? '')} onChange={(e) => onChange(e.target.value)} placeholder={f.placeholder ?? 'https://'} />;
    case 'tags':
      return <Input {...common} value={Array.isArray(value) ? value.join(', ') : String(value ?? '')} onChange={(e) => onChange(e.target.value)} />;
    case 'hours':
      return <HoursEditor value={(value as Record<string, { start: string; end: string }[]>) ?? {}} onChange={onChange} disabled={disabled} />;
    default:
      return <Input {...common} maxLength={f.maxLength ?? 300} value={String(value ?? '')} onChange={(e) => onChange(e.target.value)} />;
  }
}

/** Editor de horário de funcionamento por dia da semana. */
export function HoursEditor({ value, onChange, disabled }: { value: Record<string, { start: string; end: string }[]>; onChange: (v: unknown) => void; disabled?: boolean }) {
  const set = (day: string, list: { start: string; end: string }[]) => onChange({ ...value, [day]: list });
  return (
    <div className="divide-y rounded-lg border">
      {WEEKDAYS.map((name, i) => {
        const day = String(i);
        const list = value?.[day] ?? [];
        return (
          <div key={day} className="flex flex-wrap items-center gap-2 px-3 py-2">
            <span className="w-20 text-sm font-medium">{name}</span>
            {list.length === 0 && <span className="text-sm text-muted-foreground">Fechado</span>}
            {list.map((r, idx) => (
              <span key={idx} className="flex items-center gap-1">
                <Input type="time" className="h-8 w-[104px]" value={r.start} disabled={disabled} aria-label={`${name} abertura`} onChange={(e) => set(day, list.map((x, j) => (j === idx ? { ...x, start: e.target.value } : x)))} />
                <span className="text-muted-foreground">–</span>
                <Input type="time" className="h-8 w-[104px]" value={r.end} disabled={disabled} aria-label={`${name} fechamento`} onChange={(e) => set(day, list.map((x, j) => (j === idx ? { ...x, end: e.target.value } : x)))} />
                <Button variant="ghost" size="icon-sm" disabled={disabled} onClick={() => set(day, list.filter((_, j) => j !== idx))} aria-label="Remover faixa"><Trash2 /></Button>
              </span>
            ))}
            <Button variant="ghost" size="sm" disabled={disabled || list.length >= 3} onClick={() => set(day, [...list, { start: '08:00', end: '18:00' }])}><Plus /> Faixa</Button>
          </div>
        );
      })}
    </div>
  );
}

'use client';
import * as React from 'react';
import { Field } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import type { FieldDef, Option, ResourceDef } from '@/lib/resources/types';
import { FieldInput } from './field-input';

export function initialValues(def: ResourceDef, row?: Record<string, unknown> | null) {
  const v: Record<string, unknown> = {};
  for (const f of def.fields) v[f.name] = row ? row[f.name] ?? (f.type === 'boolean' ? false : f.type === 'multiref' ? [] : '') : f.default ?? (f.type === 'boolean' ? false : f.type === 'multiref' ? [] : '');
  return v;
}

/** Formulário gerado a partir da definição do cadastro (agrupado por seções). */
export function ResourceFields({ def, values, setValues, refOptions, tz, editing, errors, exclude = [] }: {
  def: ResourceDef; values: Record<string, unknown>; setValues: (fn: (v: Record<string, unknown>) => Record<string, unknown>) => void;
  refOptions: Record<string, Option[]>; tz: string; editing: boolean; errors?: Record<string, string>; exclude?: string[];
}) {
  const fields = def.fields.filter((f) => !f.hideInForm && !exclude.includes(f.name));
  const groups: { section: string; fields: FieldDef[] }[] = [];
  for (const f of fields) {
    const s = f.section ?? '';
    const g = groups.find((x) => x.section === s);
    if (g) g.fields.push(f); else groups.push({ section: s, fields: [f] });
  }
  return (
    <div className="space-y-6">
      {groups.map((g) => (
        <fieldset key={g.section} className="space-y-4">
          {g.section && <legend className="mb-2 text-sm font-semibold text-muted-foreground">{g.section}</legend>}
          <div className="grid gap-4 sm:grid-cols-2">
            {g.fields.map((f) => {
              const disabled = editing && f.readOnlyOnEdit;
              const input = <FieldInput f={f} value={values[f.name]} onChange={(v) => setValues((old) => ({ ...old, [f.name]: v }))} options={refOptions[f.name] ?? f.options} tz={tz} disabled={disabled} error={errors?.[f.name]} />;
              if (f.type === 'boolean') return <div key={f.name} className={cn('flex items-end', f.full && 'sm:col-span-2')}>{input}</div>;
              return (
                <Field key={f.name} label={f.label} htmlFor={`f-${f.name}`} required={f.required} hint={f.hint} error={errors?.[f.name]} className={cn((f.full || f.type === 'textarea' || f.type === 'richtext' || f.type === 'hours' || f.type === 'multiref') && 'sm:col-span-2')}>
                  {input}
                </Field>
              );
            })}
          </div>
        </fieldset>
      ))}
    </div>
  );
}

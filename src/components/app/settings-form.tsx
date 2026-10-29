'use client';
import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Save } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Field, Input, Select, Textarea, Checkbox } from '@/components/ui/input';
import { saveSetting, type SettingKey } from '@/lib/actions/settings';
import { cn } from '@/lib/utils';

export type SettingField = { name: string; label: string; type: 'int' | 'bool' | 'text' | 'textarea' | 'select'; options?: { value: string; label: string }[]; hint?: string; full?: boolean };

/** Formulário de configurações (salvo em system_settings com validação no servidor). */
export function SettingsForm({ settingKey, fields, initial, scalar }: { settingKey: SettingKey; fields: SettingField[]; initial: Record<string, any>; scalar?: boolean }) {
  const router = useRouter();
  const [v, setV] = React.useState<Record<string, any>>(initial ?? {});
  const [pending, setPending] = React.useState(false);
  return (
    <form className="space-y-5" onSubmit={async (e) => {
      e.preventDefault();
      setPending(true);
      const r = await saveSetting(settingKey, scalar ? v[fields[0].name] : v);
      setPending(false);
      if (r.ok) { toast.success('Configurações salvas.'); router.refresh(); } else toast.error(r.error);
    }}>
      <div className="grid gap-4 sm:grid-cols-2">
        {fields.map((f) => {
          const id = `${settingKey}-${f.name}`;
          if (f.type === 'bool') return <div key={f.name} className={cn('flex items-end', f.full && 'sm:col-span-2')}><Checkbox id={id} checked={!!v[f.name]} onChange={(e) => setV({ ...v, [f.name]: e.target.checked })} label={<span>{f.label}{f.hint && <span className="block text-xs text-muted-foreground">{f.hint}</span>}</span>} /></div>;
          return (
            <Field key={f.name} label={f.label} htmlFor={id} hint={f.hint} className={cn((f.full || f.type === 'textarea') && 'sm:col-span-2')}>
              {f.type === 'textarea' ? <Textarea id={id} rows={4} value={v[f.name] ?? ''} onChange={(e) => setV({ ...v, [f.name]: e.target.value })} />
                : f.type === 'select' ? <Select id={id} value={v[f.name] ?? ''} onChange={(e) => setV({ ...v, [f.name]: e.target.value })}>{f.options?.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</Select>
                : <Input id={id} type={f.type === 'int' ? 'number' : 'text'} value={v[f.name] ?? ''} onChange={(e) => setV({ ...v, [f.name]: f.type === 'int' ? e.target.value : e.target.value })} />}
            </Field>
          );
        })}
      </div>
      <Button type="submit" loading={pending}><Save /> Salvar</Button>
    </form>
  );
}

'use client';
import * as React from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { HoursEditor } from '@/components/resource/field-input';
import { saveResource } from '@/lib/actions/resources';

type Unit = Record<string, unknown> & { id: string; name: string; business_hours: Record<string, { start: string; end: string }[]> };

/** Edita o horário de funcionamento de cada unidade. */
export function UnitHours({ units }: { units: Record<string, unknown>[]; tz: string }) {
  const router = useRouter();
  const [saving, setSaving] = React.useState<string | null>(null);
  const [state, setState] = React.useState<Record<string, Unit['business_hours']>>(
    Object.fromEntries(units.map((u) => [u.id as string, (u.business_hours as Unit['business_hours']) ?? {}])),
  );
  return (
    <div className="space-y-6">
      {(units as Unit[]).map((u) => (
        <div key={u.id} className="space-y-3">
          <h3 className="font-medium">{u.name}</h3>
          <HoursEditor value={state[u.id] ?? {}} onChange={(v) => setState((s) => ({ ...s, [u.id]: v as Unit['business_hours'] }))} />
          <Button size="sm" loading={saving === u.id} onClick={async () => {
            setSaving(u.id);
            const { id, organization_id, created_at, updated_at, created_by, deleted_at, ...rest } = u;
            void organization_id; void created_at; void updated_at; void created_by; void deleted_at;
            const r = await saveResource('units', id, { ...rest, business_hours: state[u.id] });
            setSaving(null);
            if (r.ok) { toast.success('Horários salvos.'); router.refresh(); } else toast.error(r.error);
          }}>Salvar horários</Button>
        </div>
      ))}
    </div>
  );
}

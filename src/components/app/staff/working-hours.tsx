'use client';
import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input, Select } from '@/components/ui/input';
import { saveWorkingHours } from '@/lib/actions/staff';
import { WEEKDAYS } from '@/lib/format';

type Row = { weekday: number; start_time: string; end_time: string; break_start: string | null; break_end: string | null; unit_id: string | null };

export function WorkingHoursEditor({ staffId, initial, units, canEdit }: { staffId: string; initial: Row[]; units: { id: string; name: string }[]; canEdit: boolean }) {
  const router = useRouter();
  const [rows, setRows] = React.useState<Row[]>(initial.map((r) => ({ ...r, start_time: r.start_time.slice(0, 5), end_time: r.end_time.slice(0, 5), break_start: r.break_start?.slice(0, 5) ?? null, break_end: r.break_end?.slice(0, 5) ?? null })));
  const [pending, setPending] = React.useState(false);
  const upd = (i: number, patch: Partial<Row>) => setRows(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  return (
    <div className="space-y-3">
      {rows.length === 0 && <p className="text-sm text-muted-foreground">Sem jornada cadastrada (sem restrição de horário).</p>}
      {rows.map((r, i) => (
        <div key={i} className="flex flex-wrap items-center gap-2 rounded-lg border p-2">
          <Select aria-label="Dia" className="w-32" value={r.weekday} disabled={!canEdit} onChange={(e) => upd(i, { weekday: Number(e.target.value) })}>{WEEKDAYS.map((d, k) => <option key={k} value={k}>{d}</option>)}</Select>
          <Input aria-label="Início" type="time" className="w-28" value={r.start_time} disabled={!canEdit} onChange={(e) => upd(i, { start_time: e.target.value })} />
          <span>–</span>
          <Input aria-label="Fim" type="time" className="w-28" value={r.end_time} disabled={!canEdit} onChange={(e) => upd(i, { end_time: e.target.value })} />
          <span className="text-xs text-muted-foreground">intervalo</span>
          <Input aria-label="Início do intervalo" type="time" className="w-28" value={r.break_start ?? ''} disabled={!canEdit} onChange={(e) => upd(i, { break_start: e.target.value || null })} />
          <Input aria-label="Fim do intervalo" type="time" className="w-28" value={r.break_end ?? ''} disabled={!canEdit} onChange={(e) => upd(i, { break_end: e.target.value || null })} />
          {units.length > 1 && <Select aria-label="Unidade" className="w-40" value={r.unit_id ?? ''} disabled={!canEdit} onChange={(e) => upd(i, { unit_id: e.target.value || null })}><option value="">Todas as unidades</option>{units.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</Select>}
          {canEdit && <Button variant="ghost" size="icon-sm" aria-label="Remover" onClick={() => setRows(rows.filter((_, j) => j !== i))}><Trash2 /></Button>}
        </div>
      ))}
      {canEdit && (
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setRows([...rows, { weekday: rows.length ? Math.min(6, rows[rows.length - 1].weekday + 1) : 1, start_time: '07:00', end_time: '19:00', break_start: null, break_end: null, unit_id: null }])}><Plus /> Adicionar dia</Button>
          <Button size="sm" loading={pending} onClick={async () => {
            setPending(true);
            const r = await saveWorkingHours(staffId, rows);
            setPending(false);
            if (r.ok) { toast.success('Jornada salva.'); router.refresh(); } else toast.error(r.error);
          }}>Salvar jornada</Button>
        </div>
      )}
    </div>
  );
}

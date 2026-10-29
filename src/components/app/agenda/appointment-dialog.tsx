'use client';
import * as React from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, CheckCircle2, Loader2, Repeat } from 'lucide-react';
import { toast } from 'sonner';
import { Dialog } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Field, Input, Select, Textarea, Checkbox } from '@/components/ui/input';
import { checkConflicts, createAppointment, createFixedSchedule, type Conflict } from '@/lib/actions/schedule';
import { serviceKind } from '@/lib/labels';
import { WEEKDAYS_SHORT } from '@/lib/format';
import { cn } from '@/lib/utils';
import { PatientPicker, type PickedPatient } from './patient-picker';
import { minutesToTime, timeToMinutes, weekday } from './utils';
import type { AgendaOptions } from './types';

export type NewApptDefaults = { date: string; start?: string; staff_id?: string; room_id?: string; equipment_id?: string; service_id?: string; patients?: PickedPatient[] };

/** Novo agendamento: verifica conflitos em tempo real e explica exatamente cada problema. */
export function AppointmentDialog({ open, onOpenChange, defaults, options, unitId, canOverride }: {
  open: boolean; onOpenChange: (o: boolean) => void; defaults: NewApptDefaults; options: AgendaOptions; unitId: string; canOverride: boolean;
}) {
  const router = useRouter();
  const svc0 = options.services.find((s) => s.id === defaults.service_id) ?? options.services[0];
  const init = React.useCallback(() => {
    const start = defaults.start ?? '08:00';
    return {
      unit_id: unitId, service_id: svc0?.id ?? '', staff_id: defaults.staff_id ?? '', room_id: defaults.room_id ?? '', equipment_id: defaults.equipment_id ?? '',
      date: defaults.date, start, end: minutesToTime(Math.min(timeToMinutes(start) + (svc0?.default_duration_min ?? 50), 23 * 60 + 59)),
      capacity: String(svc0?.default_capacity ?? 1), kind: svc0?.kind ?? '', notes: '', use_credit: false,
      repeat: false, weekdays: [weekday(defaults.date)] as number[], ends_on: '',
    };
  }, [defaults, svc0, unitId]);
  const [v, setV] = React.useState(init);
  const [patients, setPatients] = React.useState<PickedPatient[]>(defaults.patients ?? []);
  const [conflicts, setConflicts] = React.useState<Conflict[] | null>(null);
  const [checking, setChecking] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [override, setOverride] = React.useState(false);

  React.useEffect(() => { if (open) { setV(init()); setPatients(defaults.patients ?? []); setConflicts(null); setOverride(false); } }, [open, init, defaults.patients]);

  // verificação de conflitos (debounce)
  React.useEffect(() => {
    if (!open || !v.service_id || !v.date || !v.start || !v.end) return;
    setChecking(true);
    const t = setTimeout(async () => {
      const r = await checkConflicts({ ...base(), patient_ids: patients.map((p) => p.id) });
      setChecking(false);
      setConflicts(r.ok ? r.data?.conflicts ?? [] : null);
    }, 400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, v.service_id, v.staff_id, v.room_id, v.equipment_id, v.date, v.start, v.end, v.capacity, patients]);

  const base = () => ({
    unit_id: v.unit_id, service_id: v.service_id, staff_id: v.staff_id || null, room_id: v.room_id || null, equipment_id: v.equipment_id || null,
    date: v.date, start: v.start, end: v.end, capacity: v.capacity, kind: v.kind || undefined, notes: v.notes || null,
  });

  const errors = (conflicts ?? []).filter((c) => c.severity === 'error');
  const overrides = (conflicts ?? []).filter((c) => c.severity === 'override');
  const blocked = errors.length > 0 || (overrides.length > 0 && !(canOverride && override));

  const save = async () => {
    setSaving(true);
    const r = v.repeat
      ? await createFixedSchedule({ unit_id: v.unit_id, service_id: v.service_id, staff_id: v.staff_id || null, room_id: v.room_id || null, equipment_id: v.equipment_id || null,
          weekdays: v.weekdays, start_time: v.start, duration_min: timeToMinutes(v.end) - timeToMinutes(v.start), capacity: Number(v.capacity), starts_on: v.date,
          ends_on: v.ends_on || null, patient_ids: patients.map((p) => p.id), notes: v.notes || null, override })
      : await createAppointment({ ...base(), patient_ids: patients.map((p) => p.id), use_replacement_credit: v.use_credit, override });
    setSaving(false);
    if (!r.ok) { toast.error(r.error, { duration: 8000 }); return; }
    toast.success(v.repeat ? 'Horário fixo criado e aulas geradas.' : 'Agendamento criado.');
    onOpenChange(false);
    router.refresh();
  };

  const svc = options.services.find((s) => s.id === v.service_id);
  const rooms = options.rooms.filter((r) => !r.unit_id || r.unit_id === v.unit_id);
  const equipment = options.equipment.filter((r) => !r.unit_id || r.unit_id === v.unit_id);

  return (
    <Dialog open={open} onOpenChange={onOpenChange} size="lg" title="Novo agendamento"
      footer={<>
        <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
        <Button onClick={save} loading={saving} disabled={blocked || checking}>{v.repeat ? 'Criar horário fixo' : 'Agendar'}</Button>
      </>}>
      <form className="grid gap-4 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); if (!blocked) save(); }}>
        {options.units.length > 1 && (
          <Field label="Unidade" htmlFor="ap-unit"><Select id="ap-unit" value={v.unit_id} onChange={(e) => setV({ ...v, unit_id: e.target.value, room_id: '', equipment_id: '' })}>{options.units.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</Select></Field>
        )}
        <Field label="Modalidade" htmlFor="ap-svc" required>
          <Select id="ap-svc" value={v.service_id} onChange={(e) => {
            const s = options.services.find((x) => x.id === e.target.value);
            setV({ ...v, service_id: e.target.value, kind: s?.kind ?? '', capacity: String(s?.default_capacity ?? 1), end: minutesToTime(Math.min(timeToMinutes(v.start) + (s?.default_duration_min ?? 50), 1439)) });
          }}>{options.services.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select>
        </Field>
        <Field label="Tipo de atendimento" htmlFor="ap-kind">
          <Select id="ap-kind" value={v.kind} onChange={(e) => setV({ ...v, kind: e.target.value })}>{Object.entries(serviceKind).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select>
        </Field>
        <Field label="Profissional" htmlFor="ap-staff"><Select id="ap-staff" value={v.staff_id} onChange={(e) => setV({ ...v, staff_id: e.target.value })}><option value="">—</option>{options.staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select></Field>
        <Field label="Sala" htmlFor="ap-room"><Select id="ap-room" value={v.room_id} onChange={(e) => setV({ ...v, room_id: e.target.value })}><option value="">—</option>{rooms.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select></Field>
        <Field label="Equipamento" htmlFor="ap-eq"><Select id="ap-eq" value={v.equipment_id} onChange={(e) => setV({ ...v, equipment_id: e.target.value })}><option value="">—</option>{equipment.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select></Field>
        <Field label="Data" htmlFor="ap-date" required><Input id="ap-date" type="date" value={v.date} onChange={(e) => setV({ ...v, date: e.target.value, weekdays: v.repeat ? v.weekdays : [weekday(e.target.value)] })} /></Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Início" htmlFor="ap-start" required><Input id="ap-start" type="time" step={300} value={v.start} onChange={(e) => {
            const dur = timeToMinutes(v.end) - timeToMinutes(v.start);
            setV({ ...v, start: e.target.value, end: minutesToTime(Math.min(timeToMinutes(e.target.value) + Math.max(dur, 5), 1439)) });
          }} /></Field>
          <Field label="Fim" htmlFor="ap-end" required><Input id="ap-end" type="time" step={300} value={v.end} onChange={(e) => setV({ ...v, end: e.target.value })} /></Field>
        </div>
        <Field label="Vagas" htmlFor="ap-cap" hint={svc ? `Padrão da modalidade: ${svc.default_capacity}` : undefined}><Input id="ap-cap" type="number" min={1} max={200} value={v.capacity} onChange={(e) => setV({ ...v, capacity: e.target.value })} /></Field>
        <div className="sm:col-span-2">
          <p className="mb-1.5 text-sm font-medium">Alunos</p>
          <PatientPicker value={patients} onChange={setPatients} max={Number(v.capacity) || undefined} />
          {!v.repeat && patients.length > 0 && patients.some((p) => (p.credits ?? 0) > 0) && (
            <Checkbox className="mt-2" checked={v.use_credit} onChange={(e) => setV({ ...v, use_credit: e.target.checked })} label="Agendar como reposição (usar crédito de reposição)" />
          )}
        </div>
        <Field label="Observação" htmlFor="ap-notes" className="sm:col-span-2"><Textarea id="ap-notes" rows={2} value={v.notes} onChange={(e) => setV({ ...v, notes: e.target.value })} /></Field>

        <div className="rounded-lg border p-3 sm:col-span-2">
          <Checkbox checked={v.repeat} onChange={(e) => setV({ ...v, repeat: e.target.checked })} label={<span className="flex items-center gap-1.5 font-medium"><Repeat className="h-4 w-4" /> Repetir semanalmente (horário fixo)</span>} />
          {v.repeat && (
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <div className="sm:col-span-2 flex flex-wrap gap-1.5" role="group" aria-label="Dias da semana">
                {WEEKDAYS_SHORT.map((d, i) => {
                  const on = v.weekdays.includes(i);
                  return <button key={d} type="button" aria-pressed={on} onClick={() => setV({ ...v, weekdays: on ? v.weekdays.filter((x) => x !== i) : [...v.weekdays, i].sort() })}
                    className={cn('h-9 w-12 rounded-lg border text-sm', on ? 'border-primary bg-primary text-primary-foreground' : 'hover:bg-muted')}>{d}</button>;
                })}
              </div>
              <Field label="Repetir até (opcional)" htmlFor="ap-until"><Input id="ap-until" type="date" value={v.ends_on} onChange={(e) => setV({ ...v, ends_on: e.target.value })} /></Field>
              <p className="self-end text-xs text-muted-foreground">As próximas aulas são geradas automaticamente. Pause, altere ou cancele a série quando precisar.</p>
            </div>
          )}
        </div>

        <div className="sm:col-span-2" aria-live="polite">
          {checking && <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Verificando disponibilidade…</p>}
          {!checking && conflicts && conflicts.length === 0 && <p className="flex items-center gap-2 text-sm text-success"><CheckCircle2 className="h-4 w-4" /> Horário disponível.</p>}
          {!checking && conflicts && conflicts.length > 0 && (
            <div className={cn('rounded-lg border p-3 text-sm', errors.length ? 'border-destructive/40 bg-destructive-soft/50' : 'border-warning/40 bg-warning-soft/50')}>
              <p className="mb-1 flex items-center gap-2 font-medium"><AlertTriangle className="h-4 w-4" /> {errors.length ? 'Não é possível agendar:' : 'Atenção:'}</p>
              <ul className="list-disc space-y-0.5 pl-5">{conflicts.map((c, i) => <li key={i}>{c.message}</li>)}</ul>
              {!errors.length && overrides.length > 0 && (canOverride
                ? <Checkbox className="mt-2" checked={override} onChange={(e) => setOverride(e.target.checked)} label="Autorizo esta exceção (fica registrada na auditoria)" />
                : <p className="mt-2 text-xs">Somente perfis com permissão de autorizar exceções podem agendar neste caso.</p>)}
            </div>
          )}
        </div>
        <button type="submit" className="hidden" />
      </form>
    </Dialog>
  );
}

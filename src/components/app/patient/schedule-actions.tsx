'use client';
import * as React from 'react';
import { useRouter } from 'next/navigation';
import { MoreHorizontal, CheckCircle2, XCircle, Ban, PauseCircle, PlayCircle, StopCircle, Plus, CalendarRange, Gift } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Menu, MenuItem } from '@/components/ui/menu';
import { Dialog } from '@/components/ui/dialog';
import { Field, Input, Select, Textarea } from '@/components/ui/input';
import { useConfirm } from '@/components/ui/confirm';
import { cancelParticipation, setAttendance, updateRecurrenceMember, grantManualCredit, createFixedSchedule } from '@/lib/actions/schedule';
import { todayISO, WEEKDAYS_SHORT } from '@/lib/format';
import { cn } from '@/lib/utils';

export function ParticipationActions({ participantId, status, startsAt }: { participantId: string; status: string; startsAt: string }) {
  const router = useRouter();
  const confirm = useConfirm();
  const open = ['scheduled', 'confirmed', 'replacement'].includes(status);
  const near = new Date(startsAt).getTime() <= Date.now() + 2 * 3600_000;
  const act = async (fn: () => Promise<{ ok: boolean; error?: string; data?: any }>, ok: string) => {
    const r = await fn();
    if (r.ok) { toast.success(r.data?.message ?? ok); router.refresh(); } else toast.error(r.error);
  };
  if (status === 'cancelled') return null;
  return (
    <Menu trigger={(p) => <Button variant="ghost" size="icon-sm" aria-label="Ações" {...p}><MoreHorizontal /></Button>}>
      {(close) => (
        <>
          {near && <MenuItem onClick={() => { close(); act(() => setAttendance(participantId, 'present'), 'Presença registrada.'); }}><CheckCircle2 /> Presente</MenuItem>}
          {near && <MenuItem onClick={() => { close(); act(() => setAttendance(participantId, 'absent'), 'Falta registrada.'); }}><XCircle /> Faltou</MenuItem>}
          {open && status !== 'confirmed' && <MenuItem onClick={() => { close(); act(() => setAttendance(participantId, 'confirmed'), 'Presença confirmada.'); }}><CheckCircle2 /> Confirmar presença</MenuItem>}
          {!open && <MenuItem onClick={() => { close(); act(() => setAttendance(participantId, 'scheduled'), 'Registro desfeito.'); }}><Ban /> Desfazer registro</MenuItem>}
          {open && (
            <MenuItem destructive onClick={async () => {
              close();
              const { confirmed, reason } = await confirm({ title: 'Cancelar esta aula do aluno?', description: 'As regras de antecedência definem se será gerado crédito de reposição. A vaga será liberada para a lista de espera.', requireReason: true, destructive: true, confirmLabel: 'Cancelar aula' });
              if (confirmed) act(() => cancelParticipation(participantId, reason), 'Aula cancelada.');
            }}><Ban /> Cancelar aula</MenuItem>
          )}
        </>
      )}
    </Menu>
  );
}

export function MemberActions({ memberId, status }: { memberId: string; status: string }) {
  const router = useRouter();
  const confirm = useConfirm();
  const [pause, setPause] = React.useState(false);
  const [range, setRange] = React.useState({ from: todayISO(), until: todayISO() });
  const run = async (action: 'pause' | 'resume' | 'end', from: string, until?: string) => {
    const r = await updateRecurrenceMember(memberId, action, from, until);
    if (r.ok) { toast.success('Horário fixo atualizado.'); router.refresh(); } else toast.error(r.error);
  };
  return (
    <div className="flex gap-1">
      {status === 'paused'
        ? <Button variant="outline" size="sm" onClick={() => run('resume', todayISO())}><PlayCircle /> Retomar</Button>
        : <Button variant="outline" size="sm" onClick={() => setPause(true)}><PauseCircle /> Pausar</Button>}
      <Button variant="ghost" size="sm" onClick={async () => {
        const { confirmed } = await confirm({ title: 'Encerrar este horário fixo?', description: 'As aulas futuras deste horário serão canceladas para o aluno, a partir de hoje.', destructive: true, confirmLabel: 'Encerrar' });
        if (confirmed) run('end', todayISO());
      }}><StopCircle /> Encerrar</Button>
      <Dialog open={pause} onOpenChange={setPause} size="sm" title="Pausar horário fixo" description="As aulas do período serão canceladas sem gerar reposição."
        footer={<><Button variant="outline" onClick={() => setPause(false)}>Voltar</Button><Button onClick={async () => { await run('pause', range.from, range.until); setPause(false); }}>Pausar</Button></>}>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="De" htmlFor="pf"><Input id="pf" type="date" value={range.from} onChange={(e) => setRange((r) => ({ ...r, from: e.target.value }))} /></Field>
          <Field label="Até" htmlFor="pu"><Input id="pu" type="date" value={range.until} onChange={(e) => setRange((r) => ({ ...r, until: e.target.value }))} /></Field>
        </div>
      </Dialog>
    </div>
  );
}

export function CreditActions({ patientId }: { patientId: string }) {
  const router = useRouter();
  const confirm = useConfirm();
  return (
    <Button variant="outline" size="sm" onClick={async () => {
      const { confirmed, reason } = await confirm({ title: 'Conceder crédito de reposição manual', description: 'Use para exceções autorizadas. O registro fica na auditoria.', requireReason: true, confirmLabel: 'Conceder' });
      if (!confirmed || !reason) return;
      const r = await grantManualCredit(patientId, reason);
      if (r.ok) { toast.success('Crédito concedido.'); router.refresh(); } else toast.error(r.error);
    }}><Gift /> Crédito manual</Button>
  );
}

type Opt = { id: string; name?: string; full_name?: string; unit_id?: string; default_duration_min?: number; default_capacity?: number };

/** Cadastro de horário fixo semanal para um ou mais alunos. */
export function FixedScheduleForm({ patientIds, units, unitId, services, staff, rooms, onDone }: { patientIds: string[]; units: { id: string; name: string }[]; unitId: string | null; services: Opt[]; staff: Opt[]; rooms: Opt[]; onDone: () => void }) {
  const router = useRouter();
  const [v, setV] = React.useState({
    unit_id: unitId ?? units[0]?.id ?? '', service_id: services[0]?.id ?? '', staff_id: '', room_id: '', weekdays: [] as number[],
    start_time: '18:00', duration_min: String(services[0]?.default_duration_min ?? 50), capacity: String(services[0]?.default_capacity ?? 1),
    starts_on: todayISO(), ends_on: '', name: '', notes: '',
  });
  const [pending, setPending] = React.useState(false);
  const [needsOverride, setNeedsOverride] = React.useState(false);
  const submit = async (override = false) => {
    setPending(true);
    const r = await createFixedSchedule({ ...v, patient_ids: patientIds, staff_id: v.staff_id || null, room_id: v.room_id || null, override } as any);
    setPending(false);
    if (!r.ok) {
      toast.error(r.error, { duration: 8000 });
      setNeedsOverride(/não trabalha|feriado/i.test(r.error));
      return;
    }
    toast.success('Horário fixo cadastrado. As próximas aulas foram geradas.');
    router.refresh();
    onDone();
  };
  return (
    <form className="grid gap-4 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); submit(); }}>
      {units.length > 1 && <Field label="Unidade" htmlFor="fx-unit"><Select id="fx-unit" value={v.unit_id} onChange={(e) => setV({ ...v, unit_id: e.target.value })}>{units.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</Select></Field>}
      <Field label="Modalidade" htmlFor="fx-svc" required>
        <Select id="fx-svc" value={v.service_id} onChange={(e) => { const s = services.find((x) => x.id === e.target.value); setV({ ...v, service_id: e.target.value, duration_min: String(s?.default_duration_min ?? v.duration_min), capacity: String(s?.default_capacity ?? v.capacity) }); }}>
          {services.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </Select>
      </Field>
      <Field label="Profissional" htmlFor="fx-staff"><Select id="fx-staff" value={v.staff_id} onChange={(e) => setV({ ...v, staff_id: e.target.value })}><option value="">—</option>{staff.map((s) => <option key={s.id} value={s.id}>{s.full_name}</option>)}</Select></Field>
      <Field label="Sala" htmlFor="fx-room"><Select id="fx-room" value={v.room_id} onChange={(e) => setV({ ...v, room_id: e.target.value })}><option value="">—</option>{rooms.filter((r) => !v.unit_id || r.unit_id === v.unit_id).map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</Select></Field>
      <div className="sm:col-span-2">
        <p className="mb-1.5 text-sm font-medium">Dias da semana <span className="text-destructive">*</span></p>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Dias da semana">
          {WEEKDAYS_SHORT.map((d, i) => {
            const on = v.weekdays.includes(i);
            return <button key={d} type="button" aria-pressed={on} onClick={() => setV({ ...v, weekdays: on ? v.weekdays.filter((x) => x !== i) : [...v.weekdays, i].sort() })}
              className={cn('h-10 w-14 rounded-lg border text-sm font-medium', on ? 'border-primary bg-primary text-primary-foreground' : 'hover:bg-muted')}>{d}</button>;
          })}
        </div>
      </div>
      <Field label="Horário" htmlFor="fx-time" required><Input id="fx-time" type="time" value={v.start_time} onChange={(e) => setV({ ...v, start_time: e.target.value })} /></Field>
      <Field label="Duração (min)" htmlFor="fx-dur"><Input id="fx-dur" type="number" min={5} value={v.duration_min} onChange={(e) => setV({ ...v, duration_min: e.target.value })} /></Field>
      <Field label="Vagas no horário" htmlFor="fx-cap"><Input id="fx-cap" type="number" min={1} value={v.capacity} onChange={(e) => setV({ ...v, capacity: e.target.value })} /></Field>
      <Field label="Nome da turma (opcional)" htmlFor="fx-name"><Input id="fx-name" value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} /></Field>
      <Field label="Início" htmlFor="fx-start" required><Input id="fx-start" type="date" value={v.starts_on} onChange={(e) => setV({ ...v, starts_on: e.target.value })} /></Field>
      <Field label="Término (opcional)" htmlFor="fx-end"><Input id="fx-end" type="date" value={v.ends_on} onChange={(e) => setV({ ...v, ends_on: e.target.value })} /></Field>
      <Field label="Observações" htmlFor="fx-notes" className="sm:col-span-2"><Textarea id="fx-notes" value={v.notes} onChange={(e) => setV({ ...v, notes: e.target.value })} rows={2} /></Field>
      <div className="flex flex-wrap gap-2 sm:col-span-2">
        <Button type="submit" loading={pending}><CalendarRange /> Salvar horário fixo</Button>
        {needsOverride && <Button type="button" variant="outline" onClick={() => submit(true)}>Autorizar exceção e salvar</Button>}
      </div>
      <p className="text-xs text-muted-foreground sm:col-span-2">Se já existir uma turma no mesmo dia/horário/profissional, o aluno será incluído nela (respeitando as vagas).</p>
    </form>
  );
}

export function FixedScheduleButton(props: { patientId: string; units: { id: string; name: string }[]; unitId: string | null; services: Opt[]; staff: Opt[]; rooms: Opt[] }) {
  const [open, setOpen] = React.useState(false);
  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}><Plus /> Horário fixo</Button>
      <Dialog open={open} onOpenChange={setOpen} size="lg" title="Novo horário fixo semanal" description="Cadastre uma vez e as próximas aulas são geradas automaticamente.">
        <FixedScheduleForm patientIds={[props.patientId]} units={props.units} unitId={props.unitId} services={props.services} staff={props.staff} rooms={props.rooms} onDone={() => setOpen(false)} />
      </Dialog>
    </>
  );
}

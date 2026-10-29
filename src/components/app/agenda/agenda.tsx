'use client';
import * as React from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { ChevronLeft, ChevronRight, Plus, Users, CalendarDays, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Select, Input, Checkbox } from '@/components/ui/input';
import { Dialog } from '@/components/ui/dialog';
import { checkConflicts, updateAppointment, type Conflict } from '@/lib/actions/schedule';
import { label, participantStatus } from '@/lib/labels';
import { cn } from '@/lib/utils';
import { AppointmentDialog, type NewApptDefaults } from './appointment-dialog';
import { AppointmentDetails } from './appointment-details';
import { addDays, layoutEvents, LEGEND, localParts, minutesToTime, rangeFor, STATUS_STYLE, VIEWS, weekStart, type View } from './utils';
import type { AgendaAppointment, AgendaOptions, AgendaPerms } from './types';

const HOUR_PX = 64;
const SNAP = 15;

type Column = { key: string; label: string; sub?: string; date: string; match: (a: AgendaAppointment) => boolean; drop: Partial<Record<'staff_id' | 'room_id' | 'equipment_id' | 'service_id', string>> };

type Props = {
  appointments: AgendaAppointment[];
  options: AgendaOptions;
  perms: AgendaPerms;
  tz: string;
  date: string;
  view: View;
  unitId: string;
  dayRange: { start: number; end: number };
  holidays: { date: string; name: string }[];
  openNew?: NewApptDefaults | null;
  highlightId?: string | null;
};

export function Agenda({ appointments, options, perms, tz, date, view, unitId, dayRange, holidays, openNew, highlightId }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const [filters, setFilters] = React.useState({ staff: sp.get('prof') ?? '', room: '', service: '', status: '', showCancelled: false });
  const [newAppt, setNewAppt] = React.useState<NewApptDefaults | null>(openNew ?? null);
  const [selectedId, setSelectedId] = React.useState<string | null>(highlightId ?? null);
  const [drag, setDrag] = React.useState<string | null>(null);
  const [pendingMove, setPendingMove] = React.useState<null | { appt: AgendaAppointment; date: string; start: string; end: string; patch: Column['drop']; conflicts: Conflict[]; canOverride: boolean }>(null);
  const [moving, setMoving] = React.useState(false);

  const nav = (params: Record<string, string | null>) => {
    const n = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(params)) if (v === null) n.delete(k); else n.set(k, v);
    n.delete('ag'); n.delete('novo'); n.delete('aluno');
    router.push(`${pathname}?${n.toString()}`, { scroll: false });
  };
  const step = view === 'mes' ? 'month' : view === 'semana' || view === 'lista' ? 7 : 1;
  const go = (dir: -1 | 1) => {
    if (step === 'month') { const [y, m] = date.split('-').map(Number); const d = new Date(Date.UTC(y, m - 1 + dir, 1)); nav({ data: d.toISOString().slice(0, 10) }); }
    else nav({ data: addDays(date, dir * (step as number)) });
  };
  const today = new Intl.DateTimeFormat('sv-SE', { timeZone: tz }).format(new Date());

  const filtered = appointments.filter((a) =>
    (filters.showCancelled || a.status !== 'cancelled') && (!filters.staff || a.staff_id === filters.staff) &&
    (!filters.room || a.room_id === filters.room) && (!filters.service || a.service_id === filters.service) &&
    (!filters.status || a.participants.some((p) => p.status === filters.status)));
  const selected = appointments.find((a) => a.id === selectedId) ?? null;

  // ---------------------------------------------------------------- colunas por visão
  const columns: Column[] = React.useMemo(() => {
    if (view === 'semana') {
      const s = weekStart(date);
      return Array.from({ length: 7 }, (_, i) => {
        const d = addDays(s, i);
        const lbl = new Intl.DateTimeFormat('pt-BR', { weekday: 'short', day: '2-digit', timeZone: 'UTC' }).format(new Date(d + 'T12:00:00Z'));
        return { key: d, label: lbl, date: d, match: (a) => localParts(a.starts_at, tz).date === d, drop: {} };
      });
    }
    const dayMatch = (a: AgendaAppointment) => localParts(a.starts_at, tz).date === date;
    if (view === 'profissional') return [...options.staff.map((s) => ({ key: s.id, label: s.name, date, match: (a: AgendaAppointment) => dayMatch(a) && a.staff_id === s.id, drop: { staff_id: s.id } })),
      { key: 'none', label: 'Sem profissional', date, match: (a: AgendaAppointment) => dayMatch(a) && !a.staff_id, drop: {} }];
    if (view === 'sala') return options.rooms.filter((r) => !r.unit_id || r.unit_id === unitId).map((r) => ({ key: r.id, label: r.name, sub: `${r.capacity ?? ''} lugares`, date, match: (a: AgendaAppointment) => dayMatch(a) && a.room_id === r.id, drop: { room_id: r.id } }));
    if (view === 'equipamento') return options.equipment.filter((r) => !r.unit_id || r.unit_id === unitId).map((r) => ({ key: r.id, label: r.name, date, match: (a: AgendaAppointment) => dayMatch(a) && a.equipment_id === r.id, drop: { equipment_id: r.id } }));
    if (view === 'modalidade') return options.services.map((s) => ({ key: s.id, label: s.name, date, match: (a: AgendaAppointment) => dayMatch(a) && a.service_id === s.id, drop: { service_id: s.id } }));
    return [{ key: date, label: new Intl.DateTimeFormat('pt-BR', { weekday: 'long', day: '2-digit', month: 'long', timeZone: 'UTC' }).format(new Date(date + 'T12:00:00Z')), date, match: dayMatch, drop: {} }];
  }, [view, date, options, tz, unitId]);

  // ---------------------------------------------------------------- arrastar e soltar (verifica conflitos antes)
  const onDrop = async (col: Column, minutes: number) => {
    const appt = appointments.find((a) => a.id === drag);
    setDrag(null);
    if (!appt || !perms.edit || appt.status === 'cancelled') return;
    const s = localParts(appt.starts_at, tz), e = localParts(appt.ends_at, tz);
    const dur = (e.date === s.date ? e.minutes : e.minutes + 1440) - s.minutes;
    const startM = Math.max(0, Math.round(minutes / SNAP) * SNAP);
    const start = minutesToTime(startM), end = minutesToTime(Math.min(startM + dur, 1439));
    if (col.date === s.date && start === s.time && !Object.entries(col.drop).some(([k, v]) => (appt as any)[k] !== v)) return;
    const res = await checkConflicts({
      unit_id: appt.unit_id, service_id: col.drop.service_id ?? appt.service_id, staff_id: col.drop.staff_id ?? appt.staff_id, room_id: col.drop.room_id ?? appt.room_id,
      equipment_id: col.drop.equipment_id ?? appt.equipment_id, date: col.date, start, end, capacity: appt.capacity,
      patient_ids: appt.participants.filter((p) => p.status !== 'cancelled').map((p) => p.patient_id), exclude_id: appt.id,
    });
    if (!res.ok) { toast.error(res.error); return; }
    setPendingMove({ appt, date: col.date, start, end, patch: col.drop, conflicts: res.data?.conflicts ?? [], canOverride: !!res.data?.canOverride });
  };

  const confirmMove = async (scope: 'one' | 'future', override: boolean) => {
    if (!pendingMove) return;
    setMoving(true);
    const r = await updateAppointment(pendingMove.appt.id, { date: pendingMove.date, start: pendingMove.start, end: pendingMove.end, ...pendingMove.patch, override }, scope);
    setMoving(false);
    if (!r.ok) { toast.error(r.error, { duration: 9000 }); return; }
    toast.success(scope === 'future' ? `${r.data?.updated ?? 0} aulas remarcadas.` : 'Agendamento remarcado.');
    setPendingMove(null);
    router.refresh();
  };

  const holiday = holidays.find((h) => h.date === date);

  return (
    <div className="space-y-4">
      {/* Barra de ferramentas */}
      <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="icon" onClick={() => go(-1)} aria-label="Anterior"><ChevronLeft /></Button>
          <Button variant="outline" onClick={() => nav({ data: today })}>Hoje</Button>
          <Button variant="outline" size="icon" onClick={() => go(1)} aria-label="Próximo"><ChevronRight /></Button>
          <Input type="date" value={date} onChange={(e) => e.target.value && nav({ data: e.target.value })} className="w-[150px]" aria-label="Ir para data" />
          <h2 className="ml-1 text-lg font-semibold capitalize">{periodLabel(view, date)}</h2>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select aria-label="Visualização" value={view} onChange={(e) => nav({ vis: e.target.value })} className="w-auto">{VIEWS.map((v) => <option key={v.id} value={v.id}>{v.label}</option>)}</Select>
          {perms.create && <Button onClick={() => setNewAppt({ date, start: '08:00' })}><Plus /> Agendar</Button>}
        </div>
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap items-center gap-2">
        <Select aria-label="Filtrar profissional" className="w-auto" value={filters.staff} onChange={(e) => setFilters({ ...filters, staff: e.target.value })}><option value="">Todos os profissionais</option>{options.staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select>
        <Select aria-label="Filtrar sala" className="w-auto" value={filters.room} onChange={(e) => setFilters({ ...filters, room: e.target.value })}><option value="">Todas as salas</option>{options.rooms.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select>
        <Select aria-label="Filtrar modalidade" className="w-auto" value={filters.service} onChange={(e) => setFilters({ ...filters, service: e.target.value })}><option value="">Todas as modalidades</option>{options.services.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select>
        <Select aria-label="Filtrar status" className="w-auto" value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })}><option value="">Todos os status</option>{Object.entries(participantStatus).filter(([k]) => k !== 'waiting').map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select>
        <Checkbox checked={filters.showCancelled} onChange={(e) => setFilters({ ...filters, showCancelled: e.target.checked })} label="Mostrar cancelados" />
      </div>

      {holiday && view !== 'semana' && view !== 'mes' && <p className="flex items-center gap-2 rounded-lg bg-warning-soft p-3 text-sm"><AlertTriangle className="h-4 w-4 text-warning" /> Feriado: {holiday.name}</p>}

      {view === 'mes' ? <MonthView appointments={filtered} date={date} tz={tz} today={today} holidays={holidays} onDay={(d) => nav({ data: d, vis: 'dia' })} />
        : view === 'lista' ? <ListView appointments={filtered} options={options} tz={tz} onOpen={setSelectedId} />
        : (
          <TimeGrid columns={columns} appointments={filtered} options={options} tz={tz} today={today} dayRange={dayRange} holidays={holidays}
            canDrag={perms.edit} dragging={drag} onDragStart={setDrag} onDrop={onDrop} onOpen={setSelectedId}
            onEmpty={perms.create ? (col, m) => setNewAppt({ date: col.date, start: minutesToTime(Math.round(m / SNAP) * SNAP), ...col.drop }) : undefined} />
        )}

      {/* Legenda */}
      <div className="flex flex-wrap gap-3 text-xs text-muted-foreground" aria-label="Legenda de status">
        {LEGEND.map(([k, l]) => <span key={k} className="flex items-center gap-1.5"><span className={cn('h-3 w-3 rounded border', STATUS_STYLE[k])} />{l}</span>)}
        <span className="flex items-center gap-1.5"><Users className="h-3.5 w-3.5" /> turma (ocupação)</span>
        {perms.edit && <span className="hidden md:inline">· Arraste um horário para remarcar (conflitos são verificados antes).</span>}
      </div>

      {newAppt && options.services.length > 0 && (
        <AppointmentDialog open={!!newAppt} onOpenChange={(o) => !o && setNewAppt(null)} defaults={newAppt} options={options} unitId={unitId} canOverride={perms.override} />
      )}
      <AppointmentDetails appt={selected} onClose={() => setSelectedId(null)} options={options} perms={perms} tz={tz} />

      <Dialog open={!!pendingMove} onOpenChange={(o) => !o && setPendingMove(null)} size="sm" title="Remarcar agendamento?"
        description={pendingMove ? `Para ${new Date(pendingMove.date + 'T12:00:00Z').toLocaleDateString('pt-BR', { timeZone: 'UTC' })} às ${pendingMove.start}` : undefined}>
        {pendingMove && <MoveConfirm move={pendingMove} moving={moving} onConfirm={confirmMove} onCancel={() => setPendingMove(null)} />}
      </Dialog>
    </div>
  );
}

function MoveConfirm({ move, moving, onConfirm, onCancel }: { move: { appt: AgendaAppointment; conflicts: Conflict[]; canOverride: boolean }; moving: boolean; onConfirm: (s: 'one' | 'future', o: boolean) => void; onCancel: () => void }) {
  const errors = move.conflicts.filter((c) => c.severity === 'error');
  const overrides = move.conflicts.filter((c) => c.severity === 'override');
  const [override, setOverride] = React.useState(false);
  const blocked = errors.length > 0 || (overrides.length > 0 && !override);
  return (
    <div className="space-y-4">
      {move.conflicts.length === 0 ? <p className="text-sm text-success">Sem conflitos. O novo horário está disponível.</p> : (
        <div className={cn('rounded-lg border p-3 text-sm', errors.length ? 'border-destructive/40 bg-destructive-soft/50' : 'border-warning/40 bg-warning-soft/50')}>
          <p className="mb-1 font-medium">{errors.length ? 'Não é possível remarcar:' : 'Atenção:'}</p>
          <ul className="list-disc pl-5">{move.conflicts.map((c, i) => <li key={i}>{c.message}</li>)}</ul>
          {!errors.length && move.canOverride && <Checkbox className="mt-2" checked={override} onChange={(e) => setOverride(e.target.checked)} label="Autorizar exceção" />}
        </div>
      )}
      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="outline" onClick={onCancel}>Cancelar</Button>
        {move.appt.recurrence_id && <Button variant="outline" disabled={blocked} loading={moving} onClick={() => onConfirm('future', override)}>Esta e as próximas</Button>}
        <Button disabled={blocked} loading={moving} onClick={() => onConfirm('one', override)}>{move.appt.recurrence_id ? 'Somente esta' : 'Remarcar'}</Button>
      </div>
    </div>
  );
}

function periodLabel(view: View, date: string) {
  const d = new Date(date + 'T12:00:00Z');
  if (view === 'mes') return new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(d);
  if (view === 'semana' || view === 'lista') {
    const r = rangeFor(view, date);
    const f = (x: string) => new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short', timeZone: 'UTC' }).format(new Date(x + 'T12:00:00Z'));
    return `${f(r.from)} – ${f(r.to)}`;
  }
  return new Intl.DateTimeFormat('pt-BR', { weekday: 'long', day: '2-digit', month: 'long', timeZone: 'UTC' }).format(d);
}

// ---------------------------------------------------------------------------------------------- Grade horária
function TimeGrid({ columns, appointments, options, tz, today, dayRange, holidays, canDrag, dragging, onDragStart, onDrop, onOpen, onEmpty }: {
  columns: Column[]; appointments: AgendaAppointment[]; options: AgendaOptions; tz: string; today: string; dayRange: { start: number; end: number }; holidays: { date: string; name: string }[];
  canDrag: boolean; dragging: string | null; onDragStart: (id: string | null) => void; onDrop: (c: Column, minutes: number) => void; onOpen: (id: string) => void; onEmpty?: (c: Column, minutes: number) => void;
}) {
  const startM = dayRange.start, endM = dayRange.end;
  const height = ((endM - startM) / 60) * HOUR_PX;
  const hours = Array.from({ length: Math.ceil((endM - startM) / 60) }, (_, i) => startM + i * 60);
  const scroller = React.useRef<HTMLDivElement>(null);
  const [nowM, setNowM] = React.useState<number | null>(null);
  React.useEffect(() => {
    const tick = () => setNowM(localParts(new Date().toISOString(), tz).minutes);
    tick();
    const t = setInterval(tick, 60_000);
    return () => clearInterval(t);
  }, [tz]);
  const yToMin = (el: HTMLElement, clientY: number) => startM + ((clientY - el.getBoundingClientRect().top) / HOUR_PX) * 60;
  const minWidth = columns.length > 1 ? Math.max(columns.length * 140, 600) : undefined;

  if (!columns.length) return <p className="rounded-xl border p-8 text-center text-sm text-muted-foreground">Nenhum recurso cadastrado para esta visualização.</p>;

  return (
    <div ref={scroller} className="overflow-x-auto rounded-xl border bg-card shadow-soft scrollbar-thin">
      <div style={{ minWidth }}>
        <div className="sticky top-0 z-10 flex border-b bg-card">
          <div className="w-14 shrink-0" />
          {columns.map((c) => {
            const hol = holidays.find((h) => h.date === c.date);
            return (
              <div key={c.key} className={cn('flex-1 border-l px-2 py-2 text-center text-sm font-medium capitalize', c.date === today && columns.length > 1 && !c.drop.staff_id && 'text-primary')}>
                {c.label}{c.sub && <span className="block text-xs font-normal text-muted-foreground">{c.sub}</span>}
                {hol && columns.length === 7 && <span className="block text-[11px] font-normal text-warning">{hol.name}</span>}
              </div>
            );
          })}
        </div>
        <div className="relative flex" style={{ height }}>
          <div className="w-14 shrink-0">
            {hours.map((h) => <div key={h} className="relative border-b border-transparent text-right text-[11px] text-muted-foreground" style={{ height: HOUR_PX }}><span className="absolute -top-2 right-2">{minutesToTime(h)}</span></div>)}
          </div>
          {columns.map((c) => {
            const evs = appointments.filter(c.match).map((a) => {
              const s = localParts(a.starts_at, tz), e = localParts(a.ends_at, tz);
              return { a, start: s.minutes, end: e.date !== s.date ? 1440 : e.minutes };
            });
            const laid = layoutEvents(evs);
            return (
              <div key={c.key} className={cn('relative flex-1 border-l', holidays.some((h) => h.date === c.date) && 'bg-warning-soft/30')}
                onDragOver={(e) => { if (dragging) e.preventDefault(); }}
                onDrop={(e) => { e.preventDefault(); onDrop(c, yToMin(e.currentTarget, e.clientY) - 0); }}
                onDoubleClick={(e) => { if (onEmpty && e.target === e.currentTarget) onEmpty(c, yToMin(e.currentTarget, e.clientY)); }}>
                {hours.map((h) => (
                  <button key={h} type="button" tabIndex={onEmpty ? 0 : -1} aria-label={onEmpty ? `Agendar ${minutesToTime(h)}` : undefined}
                    onClick={() => onEmpty?.(c, h)} className={cn('block w-full border-b border-dashed border-border/70', onEmpty ? 'hover:bg-primary-soft/40' : 'cursor-default')} style={{ height: HOUR_PX }} />
                ))}
                {c.date === today && nowM !== null && nowM >= startM && nowM <= endM && (
                  <div className="pointer-events-none absolute left-0 right-0 z-[5] border-t-2 border-destructive" style={{ top: ((nowM - startM) / 60) * HOUR_PX }}><span className="absolute -left-1 -top-1.5 h-3 w-3 rounded-full bg-destructive" /></div>
                )}
                {laid.map(({ a, start, end, col, cols }) => {
                  const top = ((Math.max(start, startM) - startM) / 60) * HOUR_PX;
                  const h = Math.max(((Math.min(end, endM) - Math.max(start, startM)) / 60) * HOUR_PX - 2, 22);
                  return <EventCard key={a.id} a={a} options={options} tz={tz} style={{ top, height: h, left: `calc(${(col / cols) * 100}% + 2px)`, width: `calc(${100 / cols}% - 4px)` }}
                    draggable={canDrag && a.status !== 'cancelled'} onDragStart={() => onDragStart(a.id)} onDragEnd={() => onDragStart(null)} onOpen={() => onOpen(a.id)} dragging={dragging === a.id} />;
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function aggregateStatus(a: AgendaAppointment) {
  if (a.status === 'cancelled') return 'cancelled';
  const act = a.participants.filter((p) => p.status !== 'cancelled');
  if (a.capacity > 1) return 'group';
  return act[0]?.status ?? (a.waitlist.some((w) => w.status === 'waiting') ? 'waiting' : 'scheduled');
}

function EventCard({ a, options, tz, style, draggable, onDragStart, onDragEnd, onOpen, dragging }: { a: AgendaAppointment; options: AgendaOptions; tz: string; style: React.CSSProperties; draggable: boolean; onDragStart: () => void; onDragEnd: () => void; onOpen: () => void; dragging: boolean }) {
  const svc = options.services.find((s) => s.id === a.service_id);
  const staff = options.staff.find((s) => s.id === a.staff_id);
  const act = a.participants.filter((p) => p.status !== 'cancelled');
  const st = aggregateStatus(a);
  const s = localParts(a.starts_at, tz);
  const names = act.map((p) => (p.patient.social_name || p.patient.full_name).split(' ')[0]).join(', ');
  return (
    <button type="button" draggable={draggable} onDragStart={(e) => { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', a.id); onDragStart(); }} onDragEnd={onDragEnd}
      onClick={onOpen} title={`${s.time} · ${svc?.name ?? ''} · ${staff?.name ?? ''}\n${act.map((p) => `${p.patient.full_name} (${label(participantStatus, p.status)})`).join('\n')}`}
      className={cn('absolute z-[6] overflow-hidden rounded-md border border-l-4 px-1.5 py-1 text-left text-xs shadow-sm transition-shadow hover:shadow-lift focus-visible:ring-2 focus-visible:ring-ring', STATUS_STYLE[st], dragging && 'opacity-50', draggable && 'cursor-grab active:cursor-grabbing')}
      style={{ ...style, borderLeftColor: svc?.color ?? 'hsl(var(--primary))' }}>
      <span className="flex items-center justify-between gap-1 font-medium">
        <span className="truncate">{s.time} {svc?.name}</span>
        {a.capacity > 1 && <span className={cn('shrink-0 rounded px-1 tabular-nums', act.length >= a.capacity ? 'bg-warning-soft text-warning' : 'bg-muted')}>{act.length}/{a.capacity}</span>}
      </span>
      <span className="block truncate text-muted-foreground">{names || 'Sem alunos'}</span>
      {staff && <span className="block truncate text-[11px] text-muted-foreground">{staff.name}</span>}
    </button>
  );
}

// ---------------------------------------------------------------------------------------------- Mês
function MonthView({ appointments, date, tz, today, holidays, onDay }: { appointments: AgendaAppointment[]; date: string; tz: string; today: string; holidays: { date: string; name: string }[]; onDay: (d: string) => void }) {
  const r = rangeFor('mes', date);
  const days: string[] = [];
  for (let d = r.from; d <= r.to; d = addDays(d, 1)) days.push(d);
  const byDay = new Map<string, AgendaAppointment[]>();
  for (const a of appointments) { const d = localParts(a.starts_at, tz).date; byDay.set(d, [...(byDay.get(d) ?? []), a]); }
  const month = date.slice(0, 7);
  return (
    <div className="overflow-hidden rounded-xl border bg-card shadow-soft">
      <div className="grid grid-cols-7 border-b bg-muted/40 text-center text-xs font-medium uppercase text-muted-foreground">
        {['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'].map((d) => <div key={d} className="py-2">{d}</div>)}
      </div>
      <div className="grid grid-cols-7">
        {days.map((d) => {
          const list = byDay.get(d) ?? [];
          const people = list.reduce((n, a) => n + a.participants.filter((p) => p.status !== 'cancelled').length, 0);
          const hol = holidays.find((h) => h.date === d);
          return (
            <button key={d} type="button" onClick={() => onDay(d)} className={cn('min-h-[96px] border-b border-r p-1.5 text-left align-top hover:bg-muted/40', d.slice(0, 7) !== month && 'bg-muted/20 text-muted-foreground', hol && 'bg-warning-soft/30')}>
              <span className={cn('inline-flex h-6 w-6 items-center justify-center rounded-full text-xs', d === today && 'bg-primary text-primary-foreground')}>{Number(d.slice(8))}</span>
              {hol && <span className="block truncate text-[10px] text-warning">{hol.name}</span>}
              {list.length > 0 && (
                <span className="mt-1 block text-[11px]">
                  <span className="flex items-center gap-1"><CalendarDays className="h-3 w-3" />{list.length} horário(s)</span>
                  <span className="flex items-center gap-1 text-muted-foreground"><Users className="h-3 w-3" />{people} aluno(s)</span>
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------- Lista
function ListView({ appointments, options, tz, onOpen }: { appointments: AgendaAppointment[]; options: AgendaOptions; tz: string; onOpen: (id: string) => void }) {
  const groups = new Map<string, AgendaAppointment[]>();
  for (const a of appointments) { const d = localParts(a.starts_at, tz).date; groups.set(d, [...(groups.get(d) ?? []), a]); }
  if (!groups.size) return <p className="rounded-xl border p-8 text-center text-sm text-muted-foreground">Nenhum agendamento no período.</p>;
  return (
    <div className="space-y-4">
      {[...groups.entries()].sort().map(([d, list]) => (
        <section key={d} className="rounded-xl border bg-card shadow-soft">
          <h3 className="border-b px-4 py-2 text-sm font-semibold capitalize">{new Intl.DateTimeFormat('pt-BR', { weekday: 'long', day: '2-digit', month: 'long', timeZone: 'UTC' }).format(new Date(d + 'T12:00:00Z'))}</h3>
          <ul className="divide-y">
            {list.map((a) => {
              const svc = options.services.find((s) => s.id === a.service_id);
              const staff = options.staff.find((s) => s.id === a.staff_id);
              const act = a.participants.filter((p) => p.status !== 'cancelled');
              return (
                <li key={a.id}>
                  <button type="button" onClick={() => onOpen(a.id)} className="flex w-full flex-wrap items-center gap-3 px-4 py-2.5 text-left text-sm hover:bg-muted/40">
                    <span className="w-24 tabular-nums font-medium">{localParts(a.starts_at, tz).time}–{localParts(a.ends_at, tz).time}</span>
                    <span className="h-2.5 w-2.5 rounded-full" style={{ background: svc?.color ?? 'hsl(var(--primary))' }} />
                    <span className="min-w-[140px] font-medium">{svc?.name}</span>
                    <span className="text-muted-foreground">{staff?.name ?? 'Sem profissional'}</span>
                    <span className="flex-1 truncate">{act.map((p) => p.patient.social_name || p.patient.full_name).join(', ') || <span className="text-muted-foreground">Sem alunos</span>}</span>
                    <span className="tabular-nums text-muted-foreground">{act.length}/{a.capacity}</span>
                    {a.status === 'cancelled' && <span className="text-xs text-destructive">Cancelado</span>}
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}

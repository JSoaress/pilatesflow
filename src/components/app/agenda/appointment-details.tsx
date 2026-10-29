'use client';
import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { CheckCircle2, XCircle, Ban, UserPlus, Clock, Pencil, CalendarX, ExternalLink, ListPlus, RotateCcw, FileHeart, MessageCircle } from 'lucide-react';
import { toast } from 'sonner';
import { Dialog } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Field, Input, Select, Textarea, Checkbox } from '@/components/ui/input';
import { useConfirm } from '@/components/ui/confirm';
import { addParticipant, cancelAppointment, cancelParticipation, joinWaitlist, setAttendance, updateAppointment, cancelWaitlist } from '@/lib/actions/schedule';
import { label, participantStatus, participantStatusColor, serviceKind } from '@/lib/labels';
import { whatsappLink, cn } from '@/lib/utils';
import { PatientPicker, type PickedPatient } from './patient-picker';
import { localParts } from './utils';
import type { AgendaAppointment, AgendaOptions, AgendaPerms } from './types';

/** Detalhes do horário: alunos, presença, cancelamento, reposição, lista de espera, edição. */
export function AppointmentDetails({ appt, onClose, options, perms, tz }: { appt: AgendaAppointment | null; onClose: () => void; options: AgendaOptions; perms: AgendaPerms; tz: string }) {
  const router = useRouter();
  const confirm = useConfirm();
  const [adding, setAdding] = React.useState<PickedPatient[]>([]);
  const [useCredit, setUseCredit] = React.useState(false);
  const [editing, setEditing] = React.useState(false);
  const [busy, setBusy] = React.useState<string | null>(null);
  React.useEffect(() => { setAdding([]); setEditing(false); setUseCredit(false); }, [appt?.id]);
  if (!appt) return null;

  const svc = options.services.find((s) => s.id === appt.service_id);
  const staff = options.staff.find((s) => s.id === appt.staff_id);
  const sub = options.staff.find((s) => s.id === appt.substitute_for_staff_id);
  const room = options.rooms.find((s) => s.id === appt.room_id);
  const eq = options.equipment.find((s) => s.id === appt.equipment_id);
  const start = localParts(appt.starts_at, tz);
  const end = localParts(appt.ends_at, tz);
  const active = appt.participants.filter((p) => p.status !== 'cancelled');
  const full = active.length >= appt.capacity;
  const cancelled = appt.status === 'cancelled';
  const near = new Date(appt.starts_at).getTime() <= Date.now() + 2 * 3600_000;
  const dateLabel = new Intl.DateTimeFormat('pt-BR', { timeZone: tz, weekday: 'long', day: '2-digit', month: 'long' }).format(new Date(appt.starts_at));

  const run = async (key: string, fn: () => Promise<{ ok: boolean; error?: string; data?: any }>, ok: string) => {
    setBusy(key);
    const r = await fn();
    setBusy(null);
    if (r.ok) { toast.success(r.data?.message ?? ok); router.refresh(); } else toast.error(r.error, { duration: 8000 });
    return r.ok;
  };

  const askScope = async (title: string) => {
    if (!appt.recurrence_id) return 'one' as const;
    const { confirmed } = await confirm({ title, description: 'Este horário faz parte de uma recorrência. Confirmar aplica SOMENTE a esta aula. Para alterar todas as futuras, use a opção "Esta e as próximas".', confirmLabel: 'Somente esta aula' });
    return confirmed ? ('one' as const) : null;
  };

  return (
    <Dialog open={!!appt} onOpenChange={(o) => !o && onClose()} size="lg"
      title={<span className="flex items-center gap-2"><span className="h-3 w-3 rounded-full" style={{ background: svc?.color ?? 'hsl(var(--primary))' }} />{svc?.name ?? 'Atendimento'}{cancelled && <Badge variant="neutral">Cancelado</Badge>}</span>}
      description={<span className="capitalize">{dateLabel} · {start.time}–{end.time}</span>}>
      <div className="space-y-6">
        <div className="grid gap-3 text-sm sm:grid-cols-4">
          <div><p className="text-xs text-muted-foreground">Profissional</p><p>{staff?.name ?? '—'}{sub && <span className="block text-xs text-warning">substituindo {sub.name}</span>}</p></div>
          <div><p className="text-xs text-muted-foreground">Sala</p><p>{room?.name ?? '—'}</p></div>
          <div><p className="text-xs text-muted-foreground">Equipamento</p><p>{eq?.name ?? '—'}</p></div>
          <div><p className="text-xs text-muted-foreground">Tipo</p><p>{label(serviceKind, appt.kind)}{appt.recurrence_id && <span className="block text-xs text-muted-foreground">Horário fixo{appt.is_exception ? ' (alterado)' : ''}</span>}</p></div>
        </div>
        {appt.notes && <p className="rounded-lg bg-muted p-3 text-sm">{appt.notes}</p>}
        {cancelled && appt.cancel_reason && <p className="rounded-lg bg-muted p-3 text-sm">Motivo do cancelamento: {appt.cancel_reason}</p>}

        <section>
          <div className="mb-2 flex items-center justify-between">
            <h3 className="font-medium">Alunos <span className="text-sm text-muted-foreground">({active.length}/{appt.capacity})</span></h3>
            {full && !cancelled && <Badge variant="warning">Turma lotada</Badge>}
          </div>
          {appt.participants.length === 0 && <p className="text-sm text-muted-foreground">Nenhum aluno neste horário.</p>}
          <ul className="divide-y rounded-lg border">
            {appt.participants.map((p) => {
              const open = ['scheduled', 'confirmed', 'replacement'].includes(p.status);
              const wa = whatsappLink(p.patient.whatsapp ?? p.patient.phone);
              return (
                <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5">
                  <div className="min-w-0">
                    <Link href={`/app/alunos/${p.patient_id}`} className="font-medium hover:underline">{p.patient.social_name || p.patient.full_name}</Link>
                    <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
                      <span className={cn('rounded-full border px-2 py-0.5 text-xs', participantStatusColor[p.status])}>{label(participantStatus, p.status)}</span>
                      {p.replacement_credit_id && <Badge variant="info">Reposição</Badge>}
                      {wa && <a href={wa} target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline" aria-label="WhatsApp"><MessageCircle className="inline h-3.5 w-3.5" /></a>}
                      {perms.medical && <Link href={`/app/alunos/${p.patient_id}?aba=prontuario`} className="text-xs text-primary hover:underline"><FileHeart className="inline h-3.5 w-3.5" /> Evolução</Link>}
                    </div>
                  </div>
                  {perms.edit && !cancelled && (
                    <div className="flex flex-wrap gap-1">
                      {open && near && <Button size="sm" variant="soft" loading={busy === p.id + 'p'} onClick={() => run(p.id + 'p', () => setAttendance(p.id, 'present'), 'Presença registrada.')}><CheckCircle2 /> Presente</Button>}
                      {open && near && <Button size="sm" variant="outline" loading={busy === p.id + 'a'} onClick={() => run(p.id + 'a', () => setAttendance(p.id, 'absent'), 'Falta registrada.')}><XCircle /> Faltou</Button>}
                      {open && !near && p.status === 'scheduled' && <Button size="sm" variant="outline" onClick={() => run(p.id + 'c', () => setAttendance(p.id, 'confirmed'), 'Presença confirmada.')}><CheckCircle2 /> Confirmar</Button>}
                      {['present', 'completed', 'absent'].includes(p.status) && <Button size="sm" variant="ghost" onClick={() => run(p.id + 'u', () => setAttendance(p.id, 'scheduled'), 'Registro desfeito.')}><RotateCcw /> Desfazer</Button>}
                      {open && <Button size="sm" variant="ghost" onClick={async () => {
                        const { confirmed, reason } = await confirm({ title: `Cancelar a aula de ${p.patient.full_name}?`, description: 'O sistema verifica a antecedência e aplica as regras de reposição. A vaga é liberada e o próximo da lista de espera é avisado.', requireReason: true, destructive: true, confirmLabel: 'Cancelar aula' });
                        if (confirmed) run(p.id + 'x', () => cancelParticipation(p.id, reason), 'Aula cancelada.');
                      }}><Ban /> Cancelar</Button>}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </section>

        {perms.create && !cancelled && (
          <section className="space-y-2">
            <h3 className="font-medium">{full ? 'Adicionar à lista de espera' : 'Adicionar aluno'}</h3>
            <PatientPicker value={adding} onChange={setAdding} multiple={false} />
            {adding.length > 0 && (
              <div className="flex flex-wrap items-center gap-2">
                {!full && (adding[0].credits ?? 0) > 0 && <Checkbox checked={useCredit} onChange={(e) => setUseCredit(e.target.checked)} label={`Usar crédito de reposição (${adding[0].credits})`} />}
                {full
                  ? <Button size="sm" onClick={async () => { if (await run('wl', () => joinWaitlist(appt.id, adding[0].id), 'Aluno incluído na lista de espera.')) setAdding([]); }} loading={busy === 'wl'}><ListPlus /> Entrar na lista de espera</Button>
                  : <Button size="sm" onClick={async () => { if (await run('add', () => addParticipant(appt.id, adding[0].id, useCredit, false), 'Aluno adicionado.')) setAdding([]); }} loading={busy === 'add'}><UserPlus /> Adicionar</Button>}
              </div>
            )}
          </section>
        )}

        {appt.waitlist.filter((w) => ['waiting', 'notified'].includes(w.status)).length > 0 && (
          <section>
            <h3 className="mb-2 font-medium">Lista de espera</h3>
            <ol className="divide-y rounded-lg border">
              {appt.waitlist.filter((w) => ['waiting', 'notified'].includes(w.status)).sort((a, b) => a.position - b.position).map((w, i) => (
                <li key={w.id} className="flex items-center justify-between px-3 py-2 text-sm">
                  <span>{i + 1}. {w.patient.full_name} {w.status === 'notified' && <Badge variant="warning" className="ml-1">Avisado da vaga</Badge>}</span>
                  {perms.create && (
                    <div className="flex gap-1">
                      {!full && <Button size="sm" variant="outline" onClick={() => run('w' + w.id, () => addParticipant(appt.id, w.patient_id), 'Aluno incluído na turma.')}><UserPlus /> Incluir</Button>}
                      <Button size="sm" variant="ghost" onClick={() => run('wc' + w.id, () => cancelWaitlist(w.id), 'Removido da lista de espera.')}>Remover</Button>
                    </div>
                  )}
                </li>
              ))}
            </ol>
          </section>
        )}

        {perms.edit && !cancelled && (
          <section className="flex flex-wrap gap-2 border-t pt-4">
            <Button variant="outline" size="sm" onClick={() => setEditing(true)}><Pencil /> Editar / remarcar / substituir professor</Button>
            <Button variant="outline" size="sm" className="text-destructive" onClick={async () => {
              const scope = appt.recurrence_id ? await chooseScope(confirm) : 'one';
              if (!scope) return;
              const { confirmed, reason } = await confirm({ title: scope === 'future' ? 'Cancelar esta e todas as próximas aulas da série?' : 'Cancelar este horário para todos os alunos?', description: <CancelKindHint />, requireReason: true, destructive: true, confirmLabel: 'Cancelar horário' });
              if (!confirmed || !reason) return;
              const kind = /professor|instrutor|fisioterapeuta|ausên|ausen|doen/i.test(reason) ? 'staff_absence' : /feriado/i.test(reason) ? 'holiday' : 'clinic';
              if (await run('cx', () => cancelAppointment(appt.id, reason, kind, scope), 'Horário cancelado.')) onClose();
            }}><CalendarX /> Cancelar horário</Button>
            <Link href={`/app/alunos/${appt.participants[0]?.patient_id ?? ''}`} className={cn(!appt.participants.length && 'hidden')}><Button variant="ghost" size="sm"><ExternalLink /> Ficha do aluno</Button></Link>
          </section>
        )}
      </div>
      {editing && <EditAppointment appt={appt} options={options} tz={tz} canOverride={perms.override} onDone={() => setEditing(false)} askScope={askScope} />}
    </Dialog>
  );
}

function CancelKindHint() {
  return <span>Créditos de reposição são gerados conforme as regras da clínica. Dica: mencione no motivo &quot;ausência do professor&quot; ou &quot;feriado&quot; para aplicar a regra correspondente.</span>;
}

async function chooseScope(confirm: ReturnType<typeof useConfirm>): Promise<'one' | 'future' | null> {
  const a = await confirm({ title: 'Aplicar a quais aulas?', description: 'Confirmar = SOMENTE esta aula. Voltar = escolher outra opção.', confirmLabel: 'Somente esta aula' });
  if (a.confirmed) return 'one';
  const b = await confirm({ title: 'Aplicar a esta e às próximas aulas da série?', description: 'Todas as ocorrências futuras deste horário fixo serão afetadas.', confirmLabel: 'Esta e as próximas', destructive: true });
  return b.confirmed ? 'future' : null;
}

function EditAppointment({ appt, options, tz, canOverride, onDone }: { appt: AgendaAppointment; options: AgendaOptions; tz: string; canOverride: boolean; onDone: () => void; askScope: (t: string) => Promise<'one' | null> }) {
  const router = useRouter();
  const s = localParts(appt.starts_at, tz);
  const e = localParts(appt.ends_at, tz);
  const [v, setV] = React.useState({ date: s.date, start: s.time, end: e.time, staff_id: appt.staff_id ?? '', room_id: appt.room_id ?? '', equipment_id: appt.equipment_id ?? '', capacity: String(appt.capacity), notes: appt.notes ?? '', scope: 'one' as 'one' | 'future', override: false });
  const [pending, setPending] = React.useState(false);
  return (
    <div className="mt-6 rounded-xl border bg-muted/30 p-4">
      <h3 className="mb-3 font-medium">Editar horário</h3>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Data" htmlFor="ed-date"><Input id="ed-date" type="date" value={v.date} onChange={(x) => setV({ ...v, date: x.target.value })} /></Field>
        <Field label="Início" htmlFor="ed-start"><Input id="ed-start" type="time" value={v.start} onChange={(x) => setV({ ...v, start: x.target.value })} /></Field>
        <Field label="Fim" htmlFor="ed-end"><Input id="ed-end" type="time" value={v.end} onChange={(x) => setV({ ...v, end: x.target.value })} /></Field>
        <Field label="Profissional (substituição)" htmlFor="ed-staff"><Select id="ed-staff" value={v.staff_id} onChange={(x) => setV({ ...v, staff_id: x.target.value })}><option value="">—</option>{options.staff.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}</Select></Field>
        <Field label="Sala" htmlFor="ed-room"><Select id="ed-room" value={v.room_id} onChange={(x) => setV({ ...v, room_id: x.target.value })}><option value="">—</option>{options.rooms.filter((r) => !r.unit_id || r.unit_id === appt.unit_id).map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}</Select></Field>
        <Field label="Equipamento" htmlFor="ed-eq"><Select id="ed-eq" value={v.equipment_id} onChange={(x) => setV({ ...v, equipment_id: x.target.value })}><option value="">—</option>{options.equipment.filter((r) => !r.unit_id || r.unit_id === appt.unit_id).map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}</Select></Field>
        <Field label="Vagas" htmlFor="ed-cap"><Input id="ed-cap" type="number" min={1} value={v.capacity} onChange={(x) => setV({ ...v, capacity: x.target.value })} /></Field>
        <Field label="Observação" htmlFor="ed-notes" className="sm:col-span-2"><Textarea id="ed-notes" rows={2} value={v.notes} onChange={(x) => setV({ ...v, notes: x.target.value })} /></Field>
      </div>
      {appt.recurrence_id && (
        <fieldset className="mt-3 flex flex-wrap gap-4 text-sm">
          <legend className="mb-1 text-xs text-muted-foreground">Aplicar a</legend>
          <label className="flex items-center gap-2"><input type="radio" name="scope" checked={v.scope === 'one'} onChange={() => setV({ ...v, scope: 'one' })} /> Somente esta aula</label>
          <label className="flex items-center gap-2"><input type="radio" name="scope" checked={v.scope === 'future'} onChange={() => setV({ ...v, scope: 'future' })} /> Esta e as próximas</label>
        </fieldset>
      )}
      {canOverride && <Checkbox className="mt-2" checked={v.override} onChange={(x) => setV({ ...v, override: x.target.checked })} label="Autorizar exceção (fora da jornada / feriado)" />}
      <div className="mt-4 flex gap-2">
        <Button loading={pending} onClick={async () => {
          setPending(true);
          const r = await updateAppointment(appt.id, { date: v.date, start: v.start, end: v.end, staff_id: v.staff_id || null, room_id: v.room_id || null, equipment_id: v.equipment_id || null, capacity: Number(v.capacity), notes: v.notes || null, override: v.override }, v.scope);
          setPending(false);
          if (!r.ok) { toast.error(r.error, { duration: 9000 }); return; }
          toast.success(`${r.data?.updated ?? 1} aula(s) atualizada(s).`);
          onDone();
          router.refresh();
        }}><Clock /> Salvar alterações</Button>
        <Button variant="outline" onClick={onDone}>Cancelar</Button>
      </div>
    </div>
  );
}

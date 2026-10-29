'use client';
import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Plus, Phone, MessageCircle, CalendarPlus, UserCheck, Clock, Trash2, Save, ClipboardCheck } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Field, Input, Select, Checkbox, Textarea } from '@/components/ui/input';
import { useConfirm } from '@/components/ui/confirm';
import { ResourceFields, initialValues } from '@/components/resource/resource-form';
import { saveResource, deleteResource } from '@/lib/actions/resources';
import { moveLead, convertLead, scheduleTrial, registerTrialOutcome } from '@/lib/actions/crm';
import { RESOURCES } from '@/lib/resources/defs';
import type { Option } from '@/lib/resources/types';
import { leadStage, origin, label } from '@/lib/labels';
import { relative, dateTime, todayISO } from '@/lib/format';
import { whatsappLink, cn } from '@/lib/utils';
import { InteractionButton, SendMessageButton } from '@/components/app/comm/send-message';

type Lead = Record<string, any> & { id: string; name: string; stage: string };
const STAGES = Object.keys(leadStage);

export function LeadBoard({ leads, refOptions, tz, openLeadId, units, unitId, services, staff, rooms, plans, templates, can }: {
  leads: Lead[]; refOptions: Record<string, Option[]>; tz: string; openLeadId: string | null; units: { id: string; name: string }[]; unitId: string;
  services: { id: string; name: string; default_duration_min: number; kind: string }[]; staff: { id: string; full_name: string }[]; rooms: { id: string; name: string; unit_id: string }[];
  plans: { id: string; name: string }[]; templates: any[];
  can: { create: boolean; edit: boolean; delete: boolean; schedule: boolean; convert: boolean; message: boolean };
}) {
  const router = useRouter();
  const confirm = useConfirm();
  const def = RESOURCES.leads;
  const [selected, setSelected] = React.useState<Lead | null>(leads.find((l) => l.id === openLeadId) ?? null);
  const [creating, setCreating] = React.useState(false);
  const [values, setValues] = React.useState<Record<string, unknown>>({});
  const [dragId, setDragId] = React.useState<string | null>(null);
  const [overStage, setOverStage] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);
  React.useEffect(() => { if (selected) setValues(initialValues(def, selected)); }, [selected, def]);

  const drop = async (stage: string) => {
    const lead = leads.find((l) => l.id === dragId);
    setDragId(null); setOverStage(null);
    if (!lead || lead.stage === stage || !can.edit) return;
    let reason: string | undefined;
    if (stage === 'lost') {
      const r = await confirm({ title: `Marcar ${lead.name} como perdido?`, requireReason: true, reasonLabel: 'Motivo da perda', confirmLabel: 'Marcar como perdido', destructive: true });
      if (!r.confirmed) return;
      reason = r.reason;
    }
    const res = await moveLead(lead.id, stage as any, reason);
    if (res.ok) router.refresh(); else toast.error(res.error);
  };

  const save = async () => {
    setSaving(true);
    const r = await saveResource('leads', creating ? null : selected!.id, values);
    setSaving(false);
    if (!r.ok) { toast.error(r.error); return; }
    toast.success(creating ? 'Lead cadastrado.' : 'Lead atualizado.');
    setCreating(false); setSelected(null);
    router.refresh();
  };

  const now = Date.now();
  return (
    <>
      {can.create && <div className="mb-3 flex justify-end"><Button onClick={() => { setValues(initialValues(def, null)); setCreating(true); }}><Plus /> Novo lead</Button></div>}
      <div className="flex gap-3 overflow-x-auto pb-4 scrollbar-thin">
        {STAGES.map((st) => {
          const list = leads.filter((l) => l.stage === st);
          return (
            <section key={st} aria-label={leadStage[st]}
              onDragOver={(e) => { if (dragId) { e.preventDefault(); setOverStage(st); } }} onDragLeave={() => setOverStage(null)} onDrop={(e) => { e.preventDefault(); drop(st); }}
              className={cn('flex w-[270px] shrink-0 flex-col rounded-xl border bg-muted/40', overStage === st && 'ring-2 ring-primary')}>
              <header className="flex items-center justify-between px-3 py-2.5">
                <h3 className="text-sm font-semibold">{leadStage[st]}</h3>
                <span className="rounded-full bg-card px-2 text-xs tabular-nums text-muted-foreground">{list.length}</span>
              </header>
              <div className="flex-1 space-y-2 px-2 pb-2">
                {list.length === 0 && <p className="px-2 py-6 text-center text-xs text-muted-foreground">Arraste leads para cá</p>}
                {list.map((l) => {
                  const late = l.next_contact_at && new Date(l.next_contact_at).getTime() < now && !['enrolled', 'lost'].includes(l.stage);
                  return (
                    <button key={l.id} type="button" draggable={can.edit} onDragStart={() => setDragId(l.id)} onDragEnd={() => setDragId(null)} onClick={() => setSelected(l)}
                      className={cn('w-full rounded-lg border bg-card p-3 text-left text-sm shadow-sm transition-shadow hover:shadow-lift', dragId === l.id && 'opacity-50')}>
                      <p className="font-medium">{l.name}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">{label(origin, l.origin)}{l.interest ? ` · ${l.interest}` : ''}</p>
                      <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs">
                        {l.next_contact_at && <span className={cn('inline-flex items-center gap-1', late ? 'text-destructive' : 'text-muted-foreground')}><Clock className="h-3 w-3" />{late ? 'Atrasado · ' : ''}{dateTime(l.next_contact_at, tz)}</span>}
                        {!l.next_contact_at && <span className="text-muted-foreground">{relative(l.created_at)}</span>}
                        {l.patient_id && <Badge variant="info">Ficha criada</Badge>}
                      </div>
                    </button>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>

      <Dialog open={creating} onOpenChange={setCreating} size="lg" title="Novo lead"
        footer={<><Button variant="outline" onClick={() => setCreating(false)}>Cancelar</Button><Button onClick={save} loading={saving}>Salvar</Button></>}>
        <ResourceFields def={def} values={values} setValues={setValues} refOptions={refOptions} tz={tz} editing={false} />
      </Dialog>

      <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)} size="xl" title={selected?.name ?? ''} description={selected ? `${leadStage[selected.stage]} · entrou ${relative(selected.created_at)}` : undefined}>
        {selected && (
          <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
            <div className="space-y-4">
              <ResourceFields def={def} values={values} setValues={setValues} refOptions={refOptions} tz={tz} editing />
              <div className="flex flex-wrap gap-2">
                {can.edit && <Button onClick={save} loading={saving}><Save /> Salvar</Button>}
                {can.delete && <Button variant="ghost" className="text-destructive" onClick={async () => {
                  const { confirmed } = await confirm({ title: 'Excluir lead?', destructive: true, confirmLabel: 'Excluir' });
                  if (!confirmed) return;
                  const r = await deleteResource('leads', selected.id);
                  if (r.ok) { setSelected(null); router.refresh(); } else toast.error(r.error);
                }}><Trash2 /> Excluir</Button>}
              </div>
            </div>
            <aside className="space-y-4">
              <div className="space-y-2 rounded-xl border p-4">
                <p className="text-sm font-medium">Ações rápidas</p>
                <div className="flex flex-wrap gap-2">
                  {whatsappLink(selected.whatsapp ?? selected.phone) && <a href={whatsappLink(selected.whatsapp ?? selected.phone)!} target="_blank" rel="noopener noreferrer"><Button size="sm" variant="outline"><MessageCircle /> WhatsApp</Button></a>}
                  {selected.phone && <a href={`tel:${String(selected.phone).replace(/\D/g, '')}`}><Button size="sm" variant="outline"><Phone /> Ligar</Button></a>}
                  <InteractionButton leadId={selected.id} />
                  {can.message && <SendMessageButton leadId={selected.id} templates={templates} />}
                </div>
                {selected.patient_id
                  ? <Link href={`/app/alunos/${selected.patient_id}`} className="block text-sm text-primary hover:underline"><UserCheck className="mr-1 inline h-4 w-4" />Abrir ficha do aluno</Link>
                  : can.convert && <Button size="sm" variant="soft" onClick={async () => { const r = await convertLead(selected.id); if (r.ok) { toast.success('Ficha criada.'); router.push(`/app/alunos/${r.data?.patientId}`); } else toast.error(r.error); }}><UserCheck /> Criar ficha de aluno</Button>}
              </div>
              {can.schedule && !['enrolled', 'lost'].includes(selected.stage) && <TrialScheduler leadId={selected.id} units={units} unitId={unitId} services={services} staff={staff} rooms={rooms} onDone={() => { setSelected(null); router.refresh(); }} />}
              {(selected.trial_appointment_id || selected.stage === 'trial_scheduled' || selected.stage === 'trial_done') && can.edit && <TrialOutcome leadId={selected.id} plans={plans} onDone={() => { setSelected(null); router.refresh(); }} />}
              {selected.lost_reason && <p className="rounded-lg bg-muted p-3 text-sm">Motivo da perda: {selected.lost_reason}</p>}
            </aside>
          </div>
        )}
      </Dialog>
    </>
  );
}

function TrialScheduler({ leadId, units, unitId, services, staff, rooms, onDone }: { leadId: string; units: { id: string; name: string }[]; unitId: string; services: { id: string; name: string; default_duration_min: number; kind: string }[]; staff: { id: string; full_name: string }[]; rooms: { id: string; name: string; unit_id: string }[]; onDone: () => void }) {
  const trial = services.find((s) => s.kind === 'trial') ?? services[0];
  const [v, setV] = React.useState({ unit_id: unitId, service_id: trial?.id ?? '', staff_id: '', room_id: '', date: todayISO(), start: '18:00', duration: String(trial?.default_duration_min ?? 50), override: false });
  const [pending, setPending] = React.useState(false);
  return (
    <div className="space-y-3 rounded-xl border p-4">
      <p className="flex items-center gap-2 text-sm font-medium"><CalendarPlus className="h-4 w-4" /> Agendar aula experimental</p>
      {units.length > 1 && <Select aria-label="Unidade" value={v.unit_id} onChange={(e) => setV({ ...v, unit_id: e.target.value })}>{units.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</Select>}
      <Select aria-label="Modalidade" value={v.service_id} onChange={(e) => setV({ ...v, service_id: e.target.value })}>{services.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select>
      <Select aria-label="Profissional" value={v.staff_id} onChange={(e) => setV({ ...v, staff_id: e.target.value })}><option value="">Profissional…</option>{staff.map((s) => <option key={s.id} value={s.id}>{s.full_name}</option>)}</Select>
      <Select aria-label="Sala" value={v.room_id} onChange={(e) => setV({ ...v, room_id: e.target.value })}><option value="">Sala…</option>{rooms.filter((r) => r.unit_id === v.unit_id).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select>
      <div className="grid grid-cols-2 gap-2">
        <Input type="date" aria-label="Data" value={v.date} onChange={(e) => setV({ ...v, date: e.target.value })} />
        <Input type="time" aria-label="Horário" value={v.start} onChange={(e) => setV({ ...v, start: e.target.value })} />
      </div>
      <Checkbox checked={v.override} onChange={(e) => setV({ ...v, override: e.target.checked })} label="Autorizar exceção de horário" />
      <Button size="sm" loading={pending} onClick={async () => {
        setPending(true);
        const r = await scheduleTrial(leadId, { ...v, duration: Number(v.duration) });
        setPending(false);
        if (r.ok) { toast.success('Aula experimental agendada. Lead movido para "Experimental marcada".'); onDone(); } else toast.error(r.error, { duration: 9000 });
      }}>Agendar experimental</Button>
    </div>
  );
}

function TrialOutcome({ leadId, plans, onDone }: { leadId: string; plans: { id: string; name: string }[]; onDone: () => void }) {
  const [v, setV] = React.useState({ attended: true, converted: false, offered_plan_id: '', lost_reason: '' });
  const [pending, setPending] = React.useState(false);
  return (
    <div className="space-y-3 rounded-xl border p-4">
      <p className="flex items-center gap-2 text-sm font-medium"><ClipboardCheck className="h-4 w-4" /> Resultado da experimental</p>
      <Checkbox checked={v.attended} onChange={(e) => setV({ ...v, attended: e.target.checked })} label="Compareceu" />
      <Field label="Plano oferecido" htmlFor="to-plan"><Select id="to-plan" value={v.offered_plan_id} onChange={(e) => setV({ ...v, offered_plan_id: e.target.value })}><option value="">—</option>{plans.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</Select></Field>
      <Checkbox checked={v.converted} onChange={(e) => setV({ ...v, converted: e.target.checked })} label="Converteu (matriculou)" />
      {!v.converted && v.attended && <Field label="Motivo de não conversão" htmlFor="to-lost"><Textarea id="to-lost" rows={2} value={v.lost_reason} onChange={(e) => setV({ ...v, lost_reason: e.target.value })} /></Field>}
      <Button size="sm" loading={pending} onClick={async () => {
        setPending(true);
        const r = await registerTrialOutcome(leadId, { ...v, lost_reason: v.lost_reason || null });
        setPending(false);
        if (r.ok) { toast.success(v.converted ? 'Matrícula registrada! Contrate o plano na ficha do aluno.' : 'Resultado registrado.'); onDone(); } else toast.error(r.error);
      }}>Registrar resultado</Button>
    </div>
  );
}

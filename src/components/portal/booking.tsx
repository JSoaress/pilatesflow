'use client';
import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Users } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Select, Checkbox } from '@/components/ui/input';
import { portalSlots, portalBook, portalFullClasses, portalJoinWaitlist } from '@/lib/actions/portal';
import { todayISO, addDaysISO } from '@/lib/format';
import { cn } from '@/lib/utils';

export function PortalBooking({ patientId, services, credits, sessionsRemaining, hasPlan }: { patientId: string; services: { id: string; name: string }[]; credits: number; sessionsRemaining: number | null; hasPlan: boolean }) {
  const router = useRouter();
  const [service, setService] = React.useState(services[0]?.id ?? '');
  const [day, setDay] = React.useState(todayISO());
  const [slots, setSlots] = React.useState<any[]>([]);
  const [full, setFull] = React.useState<any[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [useCredit, setUseCredit] = React.useState(!hasPlan || sessionsRemaining === 0);
  const [busy, setBusy] = React.useState<string | null>(null);
  const days = Array.from({ length: 14 }, (_, i) => addDaysISO(todayISO(), i));

  React.useEffect(() => {
    if (!service) return;
    let alive = true;
    setLoading(true);
    Promise.all([portalSlots(patientId, service, day), portalFullClasses(patientId, service, day)]).then(([a, b]) => {
      if (!alive) return;
      setSlots(a.ok ? a.data ?? [] : []);
      setFull(b.ok ? b.data ?? [] : []);
      setLoading(false);
    });
    return () => { alive = false; };
  }, [patientId, service, day]);

  if (!services.length) return <p className="rounded-xl border p-6 text-center text-sm text-muted-foreground">Nenhuma modalidade disponível para agendamento pelo portal. Fale com a recepção.</p>;
  const time = (iso: string) => new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' }).format(new Date(iso));
  return (
    <div className="space-y-5">
      <Select aria-label="Modalidade" value={service} onChange={(e) => setService(e.target.value)} className="sm:max-w-xs">{services.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select>
      <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-thin" role="listbox" aria-label="Dia">
        {days.map((d) => {
          const dt = new Date(d + 'T12:00:00Z');
          return (
            <button key={d} role="option" aria-selected={d === day} onClick={() => setDay(d)} className={cn('flex min-w-[64px] flex-col items-center rounded-xl border px-3 py-2 text-sm', d === day ? 'border-primary bg-primary text-primary-foreground' : 'bg-card hover:bg-muted')}>
              <span className="text-xs capitalize">{new Intl.DateTimeFormat('pt-BR', { weekday: 'short', timeZone: 'UTC' }).format(dt)}</span>
              <span className="text-lg font-semibold">{dt.getUTCDate()}</span>
            </button>
          );
        })}
      </div>
      {credits > 0 && <Checkbox checked={useCredit} onChange={(e) => setUseCredit(e.target.checked)} label={`Usar crédito de reposição (${credits} disponível${credits > 1 ? 'is' : ''})`} />}
      {!hasPlan && credits === 0 && <p className="rounded-lg bg-warning-soft p-3 text-sm">Você não possui plano ativo nem créditos de reposição. Fale com a recepção para contratar um plano.</p>}
      {loading ? <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Buscando horários…</p> : (
        <>
          {slots.length === 0 && full.length === 0 && <p className="rounded-xl border p-6 text-center text-sm text-muted-foreground">Nenhum horário disponível neste dia.</p>}
          {slots.length > 0 && (
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {slots.map((s) => (
                <div key={s.appointment_id} className="flex items-center justify-between rounded-xl border bg-card p-3">
                  <div><p className="text-lg font-semibold">{time(s.starts_at)}</p><p className="text-xs text-muted-foreground">{s.staff_name ?? ''} · {s.spots_left} vaga(s)</p></div>
                  <Button size="sm" loading={busy === s.appointment_id} onClick={async () => {
                    setBusy(s.appointment_id);
                    const r = await portalBook(patientId, s.appointment_id, useCredit);
                    setBusy(null);
                    if (r.ok) { toast.success('Aula agendada!'); router.push('/portal/aulas'); } else toast.error(r.error, { duration: 8000 });
                  }}>Agendar</Button>
                </div>
              ))}
            </div>
          )}
          {full.length > 0 && (
            <div>
              <p className="mb-2 mt-4 text-sm font-medium">Turmas lotadas — entre na lista de espera</p>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {full.map((f) => (
                  <div key={f.appointment_id} className="flex items-center justify-between rounded-xl border border-dashed p-3">
                    <div><p className="font-semibold">{time(f.starts_at)}</p><p className="flex items-center gap-1 text-xs text-muted-foreground"><Users className="h-3 w-3" />{f.waiting} na espera</p></div>
                    {f.on_list ? <span className="text-xs text-primary">Você está na lista</span> : <Button size="sm" variant="outline" onClick={async () => { const r = await portalJoinWaitlist(patientId, f.appointment_id); if (r.ok) { toast.success('Você entrou na lista de espera. Avisaremos se abrir vaga.'); router.refresh(); setDay(day); } else toast.error(r.error); }}>Lista de espera</Button>}
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

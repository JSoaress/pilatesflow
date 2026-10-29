'use client';
import * as React from 'react';
import Link from 'next/link';
import { CalendarCheck, Loader2, MessageCircle } from 'lucide-react';
import { fetchSlots, bookTrial } from '@/lib/actions/public';
import { Button } from '@/components/ui/button';
import { Checkbox, Field, Input, Select } from '@/components/ui/input';
import { addDaysISO, todayISO } from '@/lib/format';
import { cn, maskPhone } from '@/lib/utils';

type Options = { units: { id: string; name: string }[]; services: { id: string; name: string; kind: string; duration: number; description: string | null }[]; staff: { id: string; name: string; unit_id: string | null }[] };
type Slot = { starts_at: string; ends_at: string; staff_id: string | null; staff_name: string | null; appointment_id: string | null; spots_left: number };

export function TrialBooking({ slug, options, initialService, timezone, whatsapp }: { slug: string; options: Options; initialService?: string; timezone: string; whatsapp: string | null }) {
  const [unit, setUnit] = React.useState(options.units[0]?.id ?? '');
  const [service, setService] = React.useState(options.services.some((s) => s.id === initialService) ? initialService! : options.services[0]?.id ?? '');
  const [staff, setStaff] = React.useState('');
  const [day, setDay] = React.useState(todayISO(timezone));
  const [slots, setSlots] = React.useState<Slot[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const [slot, setSlot] = React.useState<Slot | null>(null);
  const [form, setForm] = React.useState({ name: '', phone: '', email: '', consent: false });
  const [error, setError] = React.useState<string | null>(null);
  const [done, setDone] = React.useState<{ starts_at: string; service: string; staff: string | null } | null>(null);
  const [pending, start] = React.useTransition();
  const days = Array.from({ length: 21 }, (_, i) => addDaysISO(todayISO(timezone), i));
  const staffOptions = options.staff.filter((s) => !s.unit_id || s.unit_id === unit);
  const fmtTime = (iso: string) => new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: timezone }).format(new Date(iso));
  const fmtLong = (iso: string) => new Intl.DateTimeFormat('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit', timeZone: timezone }).format(new Date(iso));

  const load = React.useCallback(async () => {
    if (!unit || !service) return;
    setLoading(true); setLoadError(null); setSlot(null);
    const r = await fetchSlots(slug, unit, service, day, staff || null);
    setLoading(false);
    if (r.ok) setSlots(r.data ?? []); else { setSlots([]); setLoadError(r.error); }
  }, [slug, unit, service, day, staff]);
  React.useEffect(() => { load(); }, [load]);

  if (done) return (
    <div className="rounded-2xl border bg-card p-8 text-center shadow-sm" role="status">
      <CalendarCheck className="mx-auto h-14 w-14 text-primary" />
      <h2 className="mt-4 font-display text-2xl">Aula agendada!</h2>
      <p className="mt-2 text-muted-foreground"><strong className="text-foreground">{done.service}</strong> em <span className="capitalize">{fmtLong(done.starts_at)}</span>{done.staff ? ` com ${done.staff}` : ''}.</p>
      <p className="mt-2 text-sm text-muted-foreground">Chegue com 10 minutos de antecedência e use roupas confortáveis. Você receberá a confirmação pelos canais informados.</p>
      <div className="mt-6 flex justify-center gap-3">
        <Link href="/"><Button variant="outline">Voltar ao site</Button></Link>
        {whatsapp && <a href={whatsapp} target="_blank" rel="noopener noreferrer"><Button><MessageCircle />Falar no WhatsApp</Button></a>}
      </div>
    </div>
  );

  return (
    <div className="space-y-8">
      <ol className="space-y-8">
        <li className="rounded-2xl border bg-card p-6 shadow-sm">
          <h2 className="font-display text-xl">1. Modalidade</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-3">
            {options.units.length > 1 && (
              <Field label="Unidade" htmlFor="tb-unit"><Select id="tb-unit" value={unit} onChange={(e) => { setUnit(e.target.value); setStaff(''); }}>{options.units.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</Select></Field>
            )}
            <Field label="Modalidade" htmlFor="tb-svc"><Select id="tb-svc" value={service} onChange={(e) => setService(e.target.value)}>{options.services.map((s) => <option key={s.id} value={s.id}>{s.name} ({s.duration} min)</option>)}</Select></Field>
            <Field label="Profissional" htmlFor="tb-staff"><Select id="tb-staff" value={staff} onChange={(e) => setStaff(e.target.value)}><option value="">Sem preferência</option>{staffOptions.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select></Field>
          </div>
          {options.services.find((s) => s.id === service)?.description && <p className="mt-3 text-sm text-muted-foreground">{options.services.find((s) => s.id === service)?.description}</p>}
        </li>

        <li className="rounded-2xl border bg-card p-6 shadow-sm">
          <h2 className="font-display text-xl">2. Dia e horário</h2>
          <div className="mt-4 flex gap-2 overflow-x-auto pb-2" role="listbox" aria-label="Escolha o dia">
            {days.map((d) => {
              const dt = new Date(d + 'T12:00:00Z');
              return (
                <button key={d} type="button" role="option" aria-selected={d === day} onClick={() => setDay(d)} className={cn('flex min-w-[64px] flex-col items-center rounded-xl border px-3 py-2 text-sm transition-colors', d === day ? 'border-primary bg-primary text-primary-foreground' : 'bg-background hover:bg-muted')}>
                  <span className="text-xs capitalize">{new Intl.DateTimeFormat('pt-BR', { weekday: 'short', timeZone: 'UTC' }).format(dt)}</span>
                  <span className="text-lg font-semibold">{dt.getUTCDate()}</span>
                  <span className="text-[10px] capitalize">{new Intl.DateTimeFormat('pt-BR', { month: 'short', timeZone: 'UTC' }).format(dt)}</span>
                </button>
              );
            })}
          </div>
          <div className="mt-4" aria-live="polite">
            {loading ? <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Buscando horários disponíveis…</p>
              : loadError ? <p className="text-sm text-destructive">{loadError} <button type="button" className="underline" onClick={load}>Tentar novamente</button></p>
              : slots.length === 0 ? <p className="rounded-xl bg-muted p-4 text-sm text-muted-foreground">Nenhum horário disponível neste dia. Experimente outro dia{whatsapp ? <> ou <a className="text-primary underline" href={whatsapp} target="_blank" rel="noopener noreferrer">fale pelo WhatsApp</a></> : null}.</p>
              : (
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-5 md:grid-cols-6">
                  {slots.map((s) => {
                    const key = `${s.starts_at}-${s.staff_id}-${s.appointment_id}`;
                    const sel = slot && `${slot.starts_at}-${slot.staff_id}-${slot.appointment_id}` === key;
                    return (
                      <button key={key} type="button" onClick={() => setSlot(s)} aria-pressed={!!sel} className={cn('rounded-lg border px-2 py-2 text-center text-sm', sel ? 'border-primary bg-primary text-primary-foreground' : 'hover:border-primary')}>
                        <span className="block font-semibold">{fmtTime(s.starts_at)}</span>
                        {!staff && s.staff_name && <span className="block truncate text-[11px] opacity-80">{s.staff_name.split(' ')[0]}</span>}
                      </button>
                    );
                  })}
                </div>
              )}
          </div>
        </li>

        <li className={cn('rounded-2xl border bg-card p-6 shadow-sm', !slot && 'opacity-60')}>
          <h2 className="font-display text-xl">3. Seus dados</h2>
          {slot && <p className="mt-1 text-sm text-primary capitalize">{fmtLong(slot.starts_at)}{slot.staff_name ? ` · ${slot.staff_name}` : ''}</p>}
          <form className="mt-4 space-y-4" onSubmit={(e) => {
            e.preventDefault(); setError(null);
            if (!slot) return setError('Escolha um horário.');
            if (!form.consent) return setError('É necessário concordar com a Política de Privacidade.');
            start(async () => {
              const r = await bookTrial(slug, { ...form, unit_id: unit, service_id: service, starts_at: slot.starts_at, appointment_id: slot.appointment_id, staff_id: slot.staff_id, utm: Object.fromEntries(new URLSearchParams(window.location.search)) });
              if (r.ok && r.data) setDone(r.data);
              else if (!r.ok) { setError(r.error); load(); }
            });
          }}>
            <fieldset disabled={!slot || pending} className="space-y-4">
              <Field label="Nome completo" htmlFor="tb-name" required><Input id="tb-name" autoComplete="name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required minLength={3} /></Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="WhatsApp" htmlFor="tb-phone" required><Input id="tb-phone" inputMode="tel" autoComplete="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: maskPhone(e.target.value) })} required /></Field>
                <Field label="E-mail" htmlFor="tb-email"><Input id="tb-email" type="email" autoComplete="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field>
              </div>
              <Checkbox checked={form.consent} onChange={(e) => setForm({ ...form, consent: e.target.checked })} label={<span>Li e concordo com a <Link href="/privacidade" target="_blank" className="text-primary underline">Política de Privacidade</Link>.</span>} />
              {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
              <Button type="submit" size="lg" loading={pending} className="w-full sm:w-auto">Confirmar agendamento</Button>
            </fieldset>
          </form>
        </li>
      </ol>
    </div>
  );
}

import Link from 'next/link';
import QRCode from 'qrcode';
import { CalendarCheck, RefreshCw, AlertTriangle, FileSignature, ClipboardList } from 'lucide-react';
import { getPortalContext } from '@/lib/auth/portal';
import { StatCard, Section } from '@/components/ui/misc';
import { Button } from '@/components/ui/button';
import { dateTime, date, money, relative } from '@/lib/format';
import { PortalAppointmentActions } from '@/components/portal/appointment-actions';

export default async function PortalHome() {
  const { supabase, me } = await getPortalContext();
  const now = new Date();
  const [appts, fin, docs, notes, qr] = await Promise.all([
    supabase.rpc('portal_appointments', { p_patient_id: me.patient_id, p_from: now.toISOString(), p_to: new Date(Date.now() + 30 * 86400000).toISOString() }),
    supabase.rpc('portal_financial', { p_patient_id: me.patient_id }),
    supabase.rpc('portal_documents', { p_patient_id: me.patient_id }),
    supabase.from('notifications').select('id, title, body, link, created_at, read_at').order('created_at', { ascending: false }).limit(5),
    QRCode.toDataURL(`pilatesflow:checkin:${me.checkin_token}`, { margin: 1, width: 200 }),
  ]);
  const upcoming = ((appts.data ?? []) as any[]).filter((a) => a.status !== 'cancelled').slice(0, 5);
  const overdue = (((fin.data as any)?.receivables ?? []) as any[]).filter((r) => r.status === 'overdue' || r.status === 'partial');
  const pendingDocs = [...(((docs.data as any)?.contracts ?? []) as any[]).filter((c) => c.status === 'sent'), ...(((docs.data as any)?.documents ?? []) as any[]).filter((d) => d.status === 'sent' && d.requires_signature)];
  const pendingAnam = (((docs.data as any)?.anamnesis ?? []) as any[]).filter((a) => a.status === 'pending');
  const b = me.balance;
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl">Olá, {(me.social_name || me.full_name).split(' ')[0]}!</h1>
        <p className="text-sm text-muted-foreground">Acompanhe suas aulas, plano e pagamentos.</p>
      </div>
      {(overdue.length > 0 || pendingDocs.length > 0 || pendingAnam.length > 0) && (
        <div className="space-y-2">
          {overdue.length > 0 && <Link href="/portal/financeiro" className="flex items-center gap-2 rounded-xl border border-destructive/30 bg-destructive-soft/50 p-3 text-sm"><AlertTriangle className="h-4 w-4 text-destructive" /> Você tem {overdue.length} pagamento(s) em atraso. Toque para ver.</Link>}
          {pendingDocs.length > 0 && <Link href="/portal/documentos" className="flex items-center gap-2 rounded-xl border border-info/30 bg-info-soft/50 p-3 text-sm"><FileSignature className="h-4 w-4 text-info" /> {pendingDocs.length} documento(s) aguardando seu aceite/assinatura.</Link>}
          {pendingAnam.length > 0 && <Link href="/portal/documentos" className="flex items-center gap-2 rounded-xl border border-warning/30 bg-warning-soft/50 p-3 text-sm"><ClipboardList className="h-4 w-4 text-warning" /> Preencha sua anamnese antes da avaliação.</Link>}
        </div>
      )}
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Plano" value={b?.plan_name ?? 'Sem plano ativo'} hint={b?.end_date ? `Válido até ${date(b.end_date)}` : undefined} icon={CalendarCheck} />
        <StatCard label="Aulas disponíveis" value={b?.sessions_remaining ?? (b?.subscription_id ? 'Ilimitadas' : '—')} hint={b?.sessions_total ? `${b.sessions_used} de ${b.sessions_total} usadas` : undefined} />
        <StatCard label="Créditos de reposição" value={b?.replacement_credits ?? 0} icon={RefreshCw} hint={b?.next_credit_expiration ? `Próximo vence ${date(b.next_credit_expiration)}` : undefined} />
      </div>
      <div className="grid gap-6 lg:grid-cols-[1fr_280px]">
        <Section title="Próximas aulas" actions={<Link href="/portal/agendar"><Button size="sm">Agendar aula</Button></Link>}>
          {upcoming.length === 0 ? <p className="text-sm text-muted-foreground">Nenhuma aula agendada.</p> : (
            <ul className="divide-y">
              {upcoming.map((a) => (
                <li key={a.participant_id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                  <div>
                    <p className="font-medium capitalize">{dateTime(a.starts_at)}</p>
                    <p className="text-sm text-muted-foreground">{a.service} · {a.staff ?? ''} · {a.unit}{a.is_replacement ? ' · reposição' : ''}</p>
                  </div>
                  <PortalAppointmentActions a={a} />
                </li>
              ))}
            </ul>
          )}
        </Section>
        <Section title="Check-in">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={qr} alt="Seu QR Code de check-in" className="mx-auto h-44 w-44 rounded-lg border bg-white p-2" />
          <p className="mt-2 text-center text-xs text-muted-foreground">Mostre na recepção ao chegar.</p>
        </Section>
      </div>
      {((notes.data ?? []) as any[]).length > 0 && (
        <Section title="Avisos">
          <ul className="space-y-2 text-sm">{((notes.data ?? []) as any[]).map((n) => <li key={n.id}><b>{n.title}</b> {n.body} <span className="text-xs text-muted-foreground">· {relative(n.created_at)}</span></li>)}</ul>
        </Section>
      )}
      {overdue.length > 0 && <p className="text-xs text-muted-foreground">Total em atraso: {money(overdue.reduce((t: number, r: any) => t + Number(r.amount) - Number(r.amount_paid), 0))}</p>}
    </div>
  );
}

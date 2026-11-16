'use client';
import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Search, Clock, ShieldCheck, Ban, ChevronDown, ChevronUp, MessageCircle, Mail, Users, UserRound } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Field, Input, Textarea } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { useConfirm } from '@/components/ui/confirm';
import { setOrgLicense } from '@/lib/actions/platform';
import { daysLeft } from '@/lib/license';
import { cn } from '@/lib/utils';

export type PlatformOrg = {
  id: string; name: string; slug: string; email: string | null; phone: string | null; created_at: string; deleted: boolean;
  license: { status: 'trial' | 'active' | 'suspended'; ok: boolean; until: string | null };
  note: string | null;
  owner: { name: string | null; email: string | null } | null;
  members: number; patients: number; last_seen: string | null;
  events: { action: string; days: number | null; note: string | null; at: string; new_until: string | null }[];
};

const fmtDate = (d: string | null) => (d ? new Date(d).toLocaleDateString('pt-BR') : '—');
const fmtDateTime = (d: string | null) => (d ? new Date(d).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : 'nunca');
const ACTION_LABEL: Record<string, string> = { extend_trial: 'Teste estendido', activate: 'Licença ativada', suspend: 'Suspensa' };

type Filter = 'all' | 'trial' | 'active' | 'expired' | 'suspended';
const FILTERS: { key: Filter; label: string }[] = [
  { key: 'all', label: 'Todas' }, { key: 'trial', label: 'Em teste' }, { key: 'active', label: 'Ativas' },
  { key: 'expired', label: 'Vencidas' }, { key: 'suspended', label: 'Suspensas' },
];
function stateOf(o: PlatformOrg): Exclude<Filter, 'all'> {
  if (o.license.status === 'suspended') return 'suspended';
  if (!o.license.ok) return 'expired';
  return o.license.status;
}

function StatusBadge({ o }: { o: PlatformOrg }) {
  const st = stateOf(o);
  const left = daysLeft(o.license.until);
  if (st === 'suspended') return <Badge variant="danger">Suspensa</Badge>;
  if (st === 'expired') return <Badge variant="warning">{o.license.status === 'trial' ? 'Teste vencido' : 'Licença vencida'} · {fmtDate(o.license.until)}</Badge>;
  if (st === 'trial') return <Badge variant="info">Teste · {left === 1 ? 'último dia' : `${left} dias`}</Badge>;
  return <Badge variant="success">Ativa · {o.license.until ? `até ${fmtDate(o.license.until)}` : 'sem prazo'}</Badge>;
}

const PERIODS = [
  { days: 30, label: '30 dias (mensal)' },
  { days: 90, label: '90 dias (trimestral)' },
  { days: 180, label: '180 dias (semestral)' },
  { days: 365, label: '1 ano (anual)' },
  { days: null, label: 'Sem prazo (vitalício)' },
] as const;

function ActivateDialog({ org, open, onOpenChange }: { org: PlatformOrg; open: boolean; onOpenChange: (o: boolean) => void }) {
  const router = useRouter();
  const [days, setDays] = React.useState<number | null>(30);
  const [custom, setCustom] = React.useState('');
  const [note, setNote] = React.useState('');
  const [pending, setPending] = React.useState(false);
  React.useEffect(() => { if (open) { setDays(30); setCustom(''); setNote(''); } }, [open]);
  const effective = custom ? Number(custom) : days;
  const base = org.license.status === 'active' && org.license.ok && org.license.until ? new Date(org.license.until) : new Date();
  const preview = effective ? new Date(base.getTime() + effective * 86400000) : null;
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title={`Liberar ${org.name}`}
      description={org.license.status === 'active' && org.license.ok && org.license.until ? 'Os dias são somados à data de vencimento atual.' : 'A licença começa a contar a partir de hoje.'}>
      <form className="space-y-4" onSubmit={async (e) => {
        e.preventDefault();
        if (custom && (!Number.isInteger(Number(custom)) || Number(custom) < 1 || Number(custom) > 3660)) { toast.error('Informe entre 1 e 3660 dias.'); return; }
        setPending(true);
        const r = await setOrgLicense({ orgId: org.id, action: 'activate', days: effective ?? null, note: note || null });
        setPending(false);
        if (!r.ok) { toast.error(r.error); return; }
        toast.success(`${org.name} liberada${preview ? ` até ${preview.toLocaleDateString('pt-BR')}` : ' sem prazo'}.`);
        onOpenChange(false);
        router.refresh();
      }}>
        <div className="grid gap-2" role="radiogroup" aria-label="Período">
          {PERIODS.map((p) => (
            <button key={p.label} type="button" role="radio" aria-checked={!custom && days === p.days} onClick={() => { setDays(p.days); setCustom(''); }}
              className={cn('rounded-lg border px-3 py-2 text-left text-sm transition-colors', !custom && days === p.days ? 'border-primary bg-primary/10 font-medium' : 'hover:bg-muted')}>
              {p.label}
            </button>
          ))}
        </div>
        <Field label="Ou outro número de dias" htmlFor="pl-days">
          <Input id="pl-days" type="number" min={1} max={3660} inputMode="numeric" value={custom} onChange={(e) => setCustom(e.target.value)} placeholder="Ex.: 45" />
        </Field>
        <Field label="Observação (opcional)" htmlFor="pl-note" hint="Ex.: pagou via Pix em 11/11, plano mensal.">
          <Textarea id="pl-note" rows={2} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
        <p className="rounded-lg bg-muted px-3 py-2 text-sm">
          Acesso liberado {preview ? <>até <strong>{preview.toLocaleDateString('pt-BR')}</strong></> : <strong>sem data de vencimento</strong>}.
        </p>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button type="submit" loading={pending}><ShieldCheck /> Liberar</Button>
        </div>
      </form>
    </Dialog>
  );
}

function OrgRow({ o }: { o: PlatformOrg }) {
  const router = useRouter();
  const confirm = useConfirm();
  const [busy, setBusy] = React.useState(false);
  const [activate, setActivate] = React.useState(false);
  const [open, setOpen] = React.useState(false);
  const phone = (o.phone ?? '').replace(/\D/g, '');

  async function run(action: 'extend_trial' | 'suspend', days: number | null, note: string | null, ok: string) {
    setBusy(true);
    const r = await setOrgLicense({ orgId: o.id, action, days, note });
    setBusy(false);
    if (!r.ok) { toast.error(r.error); return; }
    toast.success(ok);
    router.refresh();
  }

  return (
    <li className="rounded-xl border bg-card">
      <div className="flex flex-col gap-3 p-4 lg:flex-row lg:items-center">
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-semibold">{o.name}</p>
            <StatusBadge o={o} />
          </div>
          <p className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1"><UserRound className="size-3.5" /> {o.owner?.name || 'Sem nome'}{o.owner?.email ? ` · ${o.owner.email}` : ''}</span>
            <span className="inline-flex items-center gap-1"><Users className="size-3.5" /> {o.members} usuário(s) · {o.patients} aluno(s)</span>
            <span>Cadastro {fmtDate(o.created_at)}</span>
            <span>Último acesso {fmtDateTime(o.last_seen)}</span>
          </p>
          {o.note && <p className="text-xs"><span className="text-muted-foreground">Obs.:</span> {o.note}</p>}
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {phone && <a href={`https://wa.me/${phone.length <= 11 ? `55${phone}` : phone}`} target="_blank" rel="noopener noreferrer" aria-label={`WhatsApp de ${o.name}`}><Button variant="ghost" size="icon-sm"><MessageCircle /></Button></a>}
          {(o.owner?.email || o.email) && <a href={`mailto:${o.owner?.email || o.email}`} aria-label={`E-mail de ${o.name}`}><Button variant="ghost" size="icon-sm"><Mail /></Button></a>}
          <Button size="sm" variant="outline" disabled={busy} onClick={() => run('extend_trial', 7, null, `Mais 7 dias de teste para ${o.name}.`)}><Clock /> +7 dias de teste</Button>
          <Button size="sm" disabled={busy} onClick={() => setActivate(true)}><ShieldCheck /> Liberar</Button>
          {o.license.status !== 'suspended' && (
            <Button size="sm" variant="ghost" className="text-destructive" disabled={busy} onClick={async () => {
              const { confirmed, reason } = await confirm({ title: `Bloquear ${o.name}?`, description: 'A clínica perde o acesso na hora (os dados ficam guardados). Você pode liberar de novo quando quiser.', destructive: true, confirmLabel: 'Bloquear', requireReason: true, reasonLabel: 'Motivo' });
              if (confirmed) run('suspend', null, reason ?? null, `${o.name} bloqueada.`);
            }}><Ban /> Bloquear</Button>
          )}
          <Button size="icon-sm" variant="ghost" aria-expanded={open} aria-label="Histórico" onClick={() => setOpen((v) => !v)}>{open ? <ChevronUp /> : <ChevronDown />}</Button>
        </div>
      </div>
      {open && (
        <div className="border-t px-4 py-3 text-sm">
          <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">Histórico da licença</p>
          {o.events.length === 0 ? <p className="text-muted-foreground">Nenhuma alteração — teste inicial de 7 dias.</p> : (
            <ul className="space-y-1">
              {o.events.map((e, i) => (
                <li key={i} className="flex flex-wrap gap-x-2">
                  <span className="tabular-nums text-muted-foreground">{fmtDateTime(e.at)}</span>
                  <span className="font-medium">{ACTION_LABEL[e.action] ?? e.action}</span>
                  {e.days ? <span>+{e.days} dias</span> : e.action === 'activate' ? <span>sem prazo</span> : null}
                  {e.new_until && <span className="text-muted-foreground">até {fmtDate(e.new_until)}</span>}
                  {e.note && <span className="text-muted-foreground">— {e.note}</span>}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      <ActivateDialog org={o} open={activate} onOpenChange={setActivate} />
    </li>
  );
}

export function PlatformTable({ orgs }: { orgs: PlatformOrg[] }) {
  const [q, setQ] = React.useState('');
  const [filter, setFilter] = React.useState<Filter>('all');
  const term = q.trim().toLowerCase();
  const list = orgs.filter((o) => (filter === 'all' || stateOf(o) === filter)
    && (!term || [o.name, o.slug, o.owner?.name, o.owner?.email, o.email].some((v) => v?.toLowerCase().includes(term))));
  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative sm:w-80">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar clínica, dono ou e-mail" className="pl-9" aria-label="Buscar clínica" />
        </div>
        <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Filtrar">
          {FILTERS.map((f) => (
            <button key={f.key} role="tab" aria-selected={filter === f.key} onClick={() => setFilter(f.key)}
              className={cn('rounded-full border px-3 py-1 text-sm', filter === f.key ? 'border-primary bg-primary text-primary-foreground' : 'hover:bg-muted')}>
              {f.label} <span className="ml-1 opacity-70">{f.key === 'all' ? orgs.length : orgs.filter((o) => stateOf(o) === f.key).length}</span>
            </button>
          ))}
        </div>
      </div>
      {list.length === 0 ? <p className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">Nenhuma clínica encontrada.</p> : (
        <ul className="space-y-2">{list.map((o) => <OrgRow key={o.id} o={o} />)}</ul>
      )}
    </div>
  );
}

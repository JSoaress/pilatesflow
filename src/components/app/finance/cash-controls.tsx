'use client';
import * as React from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { Plus, Calculator, CheckCircle2, BadgeDollarSign } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Field, Input, Select } from '@/components/ui/input';
import { createCashMovement, calculateCommissions, setCommissionStatus } from '@/lib/actions/finance';
import { todayISO } from '@/lib/format';

export function GroupSelect({ value }: { value: string }) {
  const router = useRouter(); const pathname = usePathname(); const sp = useSearchParams();
  return (
    <Select aria-label="Agrupar por" className="w-auto" value={value} onChange={(e) => { const n = new URLSearchParams(sp.toString()); n.set('agrupar', e.target.value); router.replace(`${pathname}?${n.toString()}`); }}>
      <option value="day">Diário</option><option value="month">Mensal</option><option value="year">Anual</option>
    </Select>
  );
}

export function CashMovementButton({ categories, accounts }: { categories: { id: string; name: string; type: string }[]; accounts: { id: string; name: string }[] }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [v, setV] = React.useState({ type: 'out', amount: '', occurred_on: todayISO(), description: '', category_id: '', cash_account_id: '', source: 'manual' });
  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}><Plus /> Lançamento manual</Button>
      <Dialog open={open} onOpenChange={setOpen} size="sm" title="Lançamento manual no caixa" description="Para entradas/saídas fora de títulos (ex.: sangria, suprimento, ajuste). Lançamentos não podem ser excluídos; corrija com um ajuste."
        footer={<Button onClick={async () => {
          const r = await createCashMovement(v as any);
          if (r.ok) { toast.success('Lançamento registrado.'); setOpen(false); router.refresh(); } else toast.error(r.error);
        }}>Lançar</Button>}>
        <div className="space-y-4">
          <Field label="Tipo" htmlFor="cm-t"><Select id="cm-t" value={v.type} onChange={(e) => setV({ ...v, type: e.target.value })}><option value="in">Entrada</option><option value="out">Saída</option></Select></Field>
          <Field label="Natureza" htmlFor="cm-s"><Select id="cm-s" value={v.source} onChange={(e) => setV({ ...v, source: e.target.value })}><option value="manual">Lançamento manual</option><option value="adjustment">Ajuste/correção</option></Select></Field>
          <Field label="Valor" htmlFor="cm-a" required><Input id="cm-a" inputMode="decimal" value={v.amount} onChange={(e) => setV({ ...v, amount: e.target.value })} /></Field>
          <Field label="Data" htmlFor="cm-d"><Input id="cm-d" type="date" value={v.occurred_on} onChange={(e) => setV({ ...v, occurred_on: e.target.value })} /></Field>
          <Field label="Descrição" htmlFor="cm-desc" required><Input id="cm-desc" value={v.description} onChange={(e) => setV({ ...v, description: e.target.value })} /></Field>
          <Field label="Categoria" htmlFor="cm-c"><Select id="cm-c" value={v.category_id} onChange={(e) => setV({ ...v, category_id: e.target.value })}><option value="">—</option>{categories.filter((c) => c.type === (v.type === 'in' ? 'income' : 'expense')).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select></Field>
          {accounts.length > 1 && <Field label="Conta" htmlFor="cm-acc"><Select id="cm-acc" value={v.cash_account_id} onChange={(e) => setV({ ...v, cash_account_id: e.target.value })}><option value="">—</option>{accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</Select></Field>}
        </div>
      </Dialog>
    </>
  );
}

export function CommissionControls({ month, canCalc }: { month: string; canCalc: boolean }) {
  const router = useRouter(); const pathname = usePathname(); const sp = useSearchParams();
  const [pending, setPending] = React.useState(false);
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Input type="month" aria-label="Mês" className="w-auto" value={month} onChange={(e) => { const n = new URLSearchParams(sp.toString()); n.set('mes', e.target.value); router.replace(`${pathname}?${n.toString()}`); }} />
      {canCalc && <Button loading={pending} onClick={async () => {
        setPending(true);
        const r = await calculateCommissions(month);
        setPending(false);
        if (r.ok) { toast.success(`${r.data?.count ?? 0} lançamento(s) calculado(s).`); router.refresh(); } else toast.error(r.error);
      }}><Calculator /> Calcular comissões do mês</Button>}
    </div>
  );
}

export function CommissionRowActions({ id, status }: { id: string; status: string }) {
  const router = useRouter();
  const act = async (s: 'approved' | 'paid' | 'cancelled') => { const r = await setCommissionStatus(id, s); if (r.ok) router.refresh(); else toast.error(r.error); };
  return (
    <div className="flex justify-end gap-1">
      {status === 'calculated' && <Button size="sm" variant="outline" onClick={() => act('approved')}><CheckCircle2 /> Aprovar</Button>}
      {status === 'approved' && <Button size="sm" variant="outline" onClick={() => act('paid')}><BadgeDollarSign /> Marcar pago</Button>}
    </div>
  );
}

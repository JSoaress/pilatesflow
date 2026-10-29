'use client';
import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Plus } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Field, Input, Select, Textarea, Checkbox } from '@/components/ui/input';
import { createSubscription } from '@/lib/actions/finance';
import { money, todayISO } from '@/lib/format';
import { billingType } from '@/lib/labels';

type Plan = { id: string; name: string; price: number; cycle_months: number | null; weekly_frequency: number | null; total_sessions: number | null; billing_type: string; installments_count: number; enrollment_fee: number; discount_percent: number };

/** Contratação de plano (permite valor/desconto personalizado por aluno). */
export function SubscriptionButton({ patientId, plans, staff, canContract }: { patientId: string; plans: Plan[]; staff: { id: string; full_name: string }[]; canContract: boolean }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [v, setV] = React.useState({ plan_id: plans[0]?.id ?? '', start_date: todayISO(), custom_price: '', discount_percent: '', due_day: '10', generate_receivables: true, generate_contract: canContract, seller_staff_id: '', notes: '' });
  const [pending, setPending] = React.useState(false);
  const plan = plans.find((p) => p.id === v.plan_id);
  const price = v.custom_price ? Number(v.custom_price.replace(',', '.')) : plan?.price ?? 0;
  const discount = v.discount_percent ? Number(v.discount_percent.replace(',', '.')) : plan?.discount_percent ?? 0;
  const total = price * (1 - discount / 100);
  const parts = plan ? (plan.billing_type === 'monthly' ? plan.cycle_months ?? 1 : plan.billing_type === 'installments' ? plan.installments_count : 1) : 1;
  const submit = async () => {
    setPending(true);
    const r = await createSubscription({ ...v, patient_id: patientId, custom_price: v.custom_price || null, discount_percent: v.discount_percent || null, due_day: v.due_day || null, seller_staff_id: v.seller_staff_id || null } as any);
    setPending(false);
    if (!r.ok) { toast.error(r.error); return; }
    toast.success(r.data?.contractId ? 'Plano contratado e contrato gerado.' : 'Plano contratado.');
    setOpen(false);
    router.refresh();
  };
  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)} disabled={!plans.length}><Plus /> Contratar plano</Button>
      <Dialog open={open} onOpenChange={setOpen} size="md" title="Contratar plano"
        footer={<><Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button><Button onClick={submit} loading={pending}>Confirmar contratação</Button></>}>
        <form className="grid gap-4 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); submit(); }}>
          <Field label="Plano" htmlFor="sub-plan" required className="sm:col-span-2">
            <Select id="sub-plan" value={v.plan_id} onChange={(e) => setV({ ...v, plan_id: e.target.value })}>
              {plans.map((p) => <option key={p.id} value={p.id}>{p.name} — {money(p.price)}</option>)}
            </Select>
          </Field>
          <Field label="Início" htmlFor="sub-start" required><Input id="sub-start" type="date" value={v.start_date} onChange={(e) => setV({ ...v, start_date: e.target.value })} /></Field>
          <Field label="Dia de vencimento" htmlFor="sub-due" hint="1 a 28. Vazio = data de início."><Input id="sub-due" type="number" min={1} max={28} value={v.due_day} onChange={(e) => setV({ ...v, due_day: e.target.value })} /></Field>
          <Field label="Valor personalizado do ciclo" htmlFor="sub-price" hint={`Padrão: ${money(plan?.price)}`}><Input id="sub-price" inputMode="decimal" value={v.custom_price} onChange={(e) => setV({ ...v, custom_price: e.target.value })} /></Field>
          <Field label="Desconto (%)" htmlFor="sub-disc" hint={`Padrão: ${plan?.discount_percent ?? 0}%`}><Input id="sub-disc" inputMode="decimal" value={v.discount_percent} onChange={(e) => setV({ ...v, discount_percent: e.target.value })} /></Field>
          {staff.length > 0 && <Field label="Vendido por (comissão)" htmlFor="sub-seller"><Select id="sub-seller" value={v.seller_staff_id} onChange={(e) => setV({ ...v, seller_staff_id: e.target.value })}><option value="">—</option>{staff.map((s) => <option key={s.id} value={s.id}>{s.full_name}</option>)}</Select></Field>}
          <Field label="Observações" htmlFor="sub-notes" className="sm:col-span-2"><Textarea id="sub-notes" rows={2} value={v.notes} onChange={(e) => setV({ ...v, notes: e.target.value })} /></Field>
          <div className="space-y-1 sm:col-span-2">
            <Checkbox checked={v.generate_receivables} onChange={(e) => setV({ ...v, generate_receivables: e.target.checked })} label="Gerar cobranças (parcelas) automaticamente" />
            {canContract && <Checkbox checked={v.generate_contract} onChange={(e) => setV({ ...v, generate_contract: e.target.checked })} label="Gerar contrato a partir do modelo" />}
          </div>
          {plan && (
            <div className="rounded-lg bg-primary-soft p-3 text-sm sm:col-span-2">
              <p><b>{money(total)}</b> no ciclo · {billingType[plan.billing_type]} · {parts} parcela(s) de ~{money(total / parts)}</p>
              {plan.enrollment_fee > 0 && <p className="text-muted-foreground">+ taxa de matrícula {money(plan.enrollment_fee)}</p>}
              <p className="text-muted-foreground">{plan.weekly_frequency ? `${plan.weekly_frequency}x por semana` : `${plan.total_sessions} sessões`}</p>
            </div>
          )}
          <button type="submit" className="hidden" />
        </form>
      </Dialog>
    </>
  );
}

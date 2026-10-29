'use client';
import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Plus } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Field, Input, Select, Textarea } from '@/components/ui/input';
import { createReceivable } from '@/lib/actions/finance';
import { paymentMethod } from '@/lib/labels';
import { todayISO } from '@/lib/format';
import { PatientPicker, type PickedPatient } from '@/components/app/agenda/patient-picker';

/** Lançamento avulso de conta a receber (com parcelamento opcional). */
export function NewReceivableButton({ patientId, categories }: { patientId?: string; categories: { id: string; name: string }[]; patients?: { value: string; label: string }[] }) {
  const [picked, setPicked] = React.useState<PickedPatient[]>([]);
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [v, setV] = React.useState({ patient_id: patientId ?? '', description: '', amount: '', due_date: todayISO(), category_id: '', payment_method: '', installments: '1', notes: '' });
  const [pending, setPending] = React.useState(false);
  const submit = async () => {
    setPending(true);
    const r = await createReceivable({ ...v, patient_id: patientId ?? picked[0]?.id ?? null } as any);
    setPending(false);
    if (!r.ok) { toast.error(r.error); return; }
    toast.success('Conta a receber lançada.');
    setOpen(false);
    setV((o) => ({ ...o, description: '', amount: '' }));
    router.refresh();
  };
  return (
    <>
      <Button size="sm" variant={patientId ? 'outline' : 'default'} onClick={() => setOpen(true)}><Plus /> Nova cobrança</Button>
      <Dialog open={open} onOpenChange={setOpen} title="Nova conta a receber"
        footer={<><Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button><Button onClick={submit} loading={pending}>Lançar</Button></>}>
        <form className="grid gap-4 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); submit(); }}>
          {!patientId && (
            <div className="sm:col-span-2"><p className="mb-1.5 text-sm font-medium">Aluno (opcional)</p><PatientPicker value={picked} onChange={setPicked} multiple={false} /></div>
          )}
          <Field label="Descrição" htmlFor="ar-desc" required className="sm:col-span-2"><Input id="ar-desc" value={v.description} onChange={(e) => setV({ ...v, description: e.target.value })} placeholder="Avaliação, sessão avulsa, produto…" /></Field>
          <Field label="Valor total" htmlFor="ar-amount" required><Input id="ar-amount" inputMode="decimal" value={v.amount} onChange={(e) => setV({ ...v, amount: e.target.value })} /></Field>
          <Field label="Parcelas" htmlFor="ar-inst"><Input id="ar-inst" type="number" min={1} max={24} value={v.installments} onChange={(e) => setV({ ...v, installments: e.target.value })} /></Field>
          <Field label="Vencimento (1ª parcela)" htmlFor="ar-due" required><Input id="ar-due" type="date" value={v.due_date} onChange={(e) => setV({ ...v, due_date: e.target.value })} /></Field>
          <Field label="Categoria" htmlFor="ar-cat"><Select id="ar-cat" value={v.category_id} onChange={(e) => setV({ ...v, category_id: e.target.value })}><option value="">—</option>{categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select></Field>
          <Field label="Forma de pagamento prevista" htmlFor="ar-method"><Select id="ar-method" value={v.payment_method} onChange={(e) => setV({ ...v, payment_method: e.target.value })}><option value="">—</option>{Object.entries(paymentMethod).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select></Field>
          <Field label="Observações" htmlFor="ar-notes" className="sm:col-span-2"><Textarea id="ar-notes" rows={2} value={v.notes} onChange={(e) => setV({ ...v, notes: e.target.value })} /></Field>
          <button type="submit" className="hidden" />
        </form>
      </Dialog>
    </>
  );
}

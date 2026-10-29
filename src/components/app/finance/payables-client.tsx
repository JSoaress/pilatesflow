'use client';
import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Banknote, Ban, Paperclip, FileDown } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Field, Input, Select } from '@/components/ui/input';
import { Badge, statusVariant } from '@/components/ui/badge';
import { useConfirm } from '@/components/ui/confirm';
import { ResourceManager, type ResourceManagerProps } from '@/components/resource/resource-manager';
import { payPayable, cancelPayable, uploadPayableReceipt } from '@/lib/actions/finance';
import { paymentMethod, payableStatus } from '@/lib/labels';
import { todayISO } from '@/lib/format';

function PayableRowActions({ row, accounts, canEdit }: { row: Record<string, any>; accounts: { id: string; name: string }[]; canEdit: boolean }) {
  const router = useRouter();
  const confirm = useConfirm();
  const [open, setOpen] = React.useState(false);
  const [v, setV] = React.useState({ paid_on: todayISO(), amount: String(row.amount), method: row.payment_method ?? 'pix', cash_account_id: '' });
  const fileRef = React.useRef<HTMLInputElement>(null);
  const open_ = ['pending', 'overdue'].includes(row.status);
  return (
    <>
      <Badge variant={statusVariant[row.status] ?? 'neutral'} className="mr-1">{payableStatus[row.status]}</Badge>
      {row.receipt_path && <a href={`/api/files/payable/${row.id}`} target="_blank" rel="noopener noreferrer"><Button variant="ghost" size="icon-sm" aria-label="Ver comprovante"><FileDown /></Button></a>}
      {canEdit && (
        <>
          <input ref={fileRef} type="file" accept="application/pdf,image/*" className="hidden" onChange={async (e) => {
            const f = e.target.files?.[0]; if (!f) return;
            const fd = new FormData(); fd.append('file', f);
            const r = await uploadPayableReceipt(row.id, fd);
            if (r.ok) { toast.success('Comprovante anexado.'); router.refresh(); } else toast.error(r.error);
            e.target.value = '';
          }} />
          <Button variant="ghost" size="icon-sm" aria-label="Anexar comprovante" onClick={() => fileRef.current?.click()}><Paperclip /></Button>
        </>
      )}
      {canEdit && open_ && <Button size="sm" onClick={() => setOpen(true)}><Banknote /> Pagar</Button>}
      {canEdit && open_ && <Button variant="ghost" size="icon-sm" aria-label="Cancelar conta" onClick={async () => {
        const { confirmed, reason } = await confirm({ title: 'Cancelar esta conta?', requireReason: true, destructive: true, confirmLabel: 'Cancelar conta' });
        if (!confirmed || !reason) return;
        const r = await cancelPayable(row.id, reason);
        if (r.ok) { toast.success('Conta cancelada.'); router.refresh(); } else toast.error(r.error);
      }}><Ban /></Button>}
      <Dialog open={open} onOpenChange={setOpen} size="sm" title="Registrar pagamento" description={row.description}
        footer={<Button onClick={async () => {
          const r = await payPayable(row.id, v);
          if (r.ok) { toast.success('Pagamento registrado. Saída lançada no caixa.'); setOpen(false); router.refresh(); } else toast.error(r.error);
        }}>Confirmar pagamento</Button>}>
        <div className="space-y-4">
          <Field label="Data" htmlFor="pp-date"><Input id="pp-date" type="date" value={v.paid_on} onChange={(e) => setV({ ...v, paid_on: e.target.value })} /></Field>
          <Field label="Valor pago" htmlFor="pp-amt"><Input id="pp-amt" inputMode="decimal" value={v.amount} onChange={(e) => setV({ ...v, amount: e.target.value })} /></Field>
          <Field label="Forma de pagamento" htmlFor="pp-m"><Select id="pp-m" value={v.method} onChange={(e) => setV({ ...v, method: e.target.value })}>{Object.entries(paymentMethod).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select></Field>
          {accounts.length > 1 && <Field label="Conta / caixa" htmlFor="pp-acc"><Select id="pp-acc" value={v.cash_account_id} onChange={(e) => setV({ ...v, cash_account_id: e.target.value })}><option value="">Automático</option>{accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</Select></Field>}
        </div>
      </Dialog>
    </>
  );
}

export function PayablesClient(props: ResourceManagerProps & { accounts: { id: string; name: string }[]; canPay: boolean }) {
  const { accounts, canPay, ...rest } = props;
  return <ResourceManager {...rest} rowActions={(row) => <PayableRowActions row={row} accounts={accounts} canEdit={canPay} />} />;
}

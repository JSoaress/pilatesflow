'use client';
import * as React from 'react';
import { useRouter } from 'next/navigation';
import { HandCoins, QrCode, Copy, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Field, Input, Select, Textarea } from '@/components/ui/input';
import { registerPayment, createGatewayCharge } from '@/lib/actions/finance';
import { paymentMethod } from '@/lib/labels';
import { money, todayISO } from '@/lib/format';

export type ReceivableLite = { id: string; description: string; open_amount: number; due_date: string; patient_name?: string | null; payment_method?: string | null };

/** Baixa manual de um título (total ou parcial). */
export function PaymentButton({ receivable, accounts, size = 'sm', label = 'Receber' }: { receivable: ReceivableLite; accounts: { id: string; name: string }[]; size?: 'sm' | 'default'; label?: string }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [v, setV] = React.useState({ amount: String(receivable.open_amount), method: receivable.payment_method ?? 'pix', paid_on: todayISO(), cash_account_id: '', notes: '' });
  const [pending, setPending] = React.useState(false);
  const submit = async () => {
    setPending(true);
    const r = await registerPayment({ receivable_id: receivable.id, amount: v.amount.replace(',', '.'), method: v.method as any, paid_on: v.paid_on, cash_account_id: v.cash_account_id || null, notes: v.notes || null });
    setPending(false);
    if (!r.ok) { toast.error(r.error); return; }
    toast.success('Pagamento registrado.', { action: { label: 'Ver recibo', onClick: () => window.open(`/imprimir/recibo/${r.data?.paymentId}`, '_blank') } });
    setOpen(false);
    router.refresh();
  };
  return (
    <>
      <Button size={size} onClick={() => setOpen(true)}><HandCoins /> {label}</Button>
      <Dialog open={open} onOpenChange={setOpen} size="sm" title="Registrar recebimento" description={`${receivable.description}${receivable.patient_name ? ` · ${receivable.patient_name}` : ''}`}
        footer={<><Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button><Button onClick={submit} loading={pending}>Confirmar recebimento</Button></>}>
        <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); submit(); }}>
          <p className="rounded-lg bg-muted p-3 text-sm">Saldo em aberto: <b>{money(receivable.open_amount)}</b></p>
          <Field label="Valor recebido" htmlFor="pay-amount" required hint="Pode ser parcial."><Input id="pay-amount" inputMode="decimal" value={v.amount} onChange={(e) => setV({ ...v, amount: e.target.value })} /></Field>
          <Field label="Forma de pagamento" htmlFor="pay-method" required>
            <Select id="pay-method" value={v.method} onChange={(e) => setV({ ...v, method: e.target.value })}>{Object.entries(paymentMethod).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select>
          </Field>
          <Field label="Data do pagamento" htmlFor="pay-date" required><Input id="pay-date" type="date" max={todayISO()} value={v.paid_on} onChange={(e) => setV({ ...v, paid_on: e.target.value })} /></Field>
          {accounts.length > 1 && (
            <Field label="Conta / caixa" htmlFor="pay-acc"><Select id="pay-acc" value={v.cash_account_id} onChange={(e) => setV({ ...v, cash_account_id: e.target.value })}><option value="">Automático</option>{accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</Select></Field>
          )}
          <Field label="Observação" htmlFor="pay-notes"><Textarea id="pay-notes" rows={2} value={v.notes} onChange={(e) => setV({ ...v, notes: e.target.value })} /></Field>
          <button type="submit" className="hidden" />
        </form>
      </Dialog>
    </>
  );
}

/** Gera cobrança Pix/boleto/link no gateway conectado (sem simulação). */
export function ChargeButton({ receivableId }: { receivableId: string }) {
  const [open, setOpen] = React.useState(false);
  const [pending, setPending] = React.useState<string | null>(null);
  const [charge, setCharge] = React.useState<{ pixCopyPaste?: string; pixQrImage?: string; paymentUrl?: string } | null>(null);
  const gen = async (method: 'pix' | 'boleto' | 'link') => {
    setPending(method);
    const r = await createGatewayCharge(receivableId, method);
    setPending(null);
    if (!r.ok) { toast.error(r.error); return; }
    setCharge(r.data ?? null);
  };
  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}><QrCode /> Cobrar</Button>
      <Dialog open={open} onOpenChange={setOpen} size="sm" title="Gerar cobrança" description="Pix, boleto ou link de pagamento pelo provedor conectado. A baixa é automática quando o provedor confirmar.">
        {!charge ? (
          <div className="grid gap-2">
            <Button variant="outline" loading={pending === 'pix'} onClick={() => gen('pix')}>Pix (copia e cola + QR Code)</Button>
            <Button variant="outline" loading={pending === 'boleto'} onClick={() => gen('boleto')}>Boleto</Button>
            <Button variant="outline" loading={pending === 'link'} onClick={() => gen('link')}>Link de pagamento (cartão)</Button>
          </div>
        ) : (
          <div className="space-y-3 text-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {charge.pixQrImage && <img src={charge.pixQrImage} alt="QR Code Pix" className="mx-auto h-48 w-48" />}
            {charge.pixCopyPaste && (
              <div className="rounded-lg border p-2 text-left">
                <p className="break-all font-mono text-xs">{charge.pixCopyPaste}</p>
                <Button size="sm" variant="ghost" onClick={() => { navigator.clipboard.writeText(charge.pixCopyPaste!); toast.success('Código copiado.'); }}><Copy /> Copiar código</Button>
              </div>
            )}
            {charge.paymentUrl && <a href={charge.paymentUrl} target="_blank" rel="noopener noreferrer"><Button variant="outline"><ExternalLink /> Abrir link de pagamento</Button></a>}
          </div>
        )}
      </Dialog>
    </>
  );
}

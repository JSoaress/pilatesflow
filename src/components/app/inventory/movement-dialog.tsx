'use client';
import * as React from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeftRight, ShoppingBag } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Field, Input, Select, Textarea } from '@/components/ui/input';
import { createInventoryMovement } from '@/lib/actions/inventory';
import { sellProduct } from '@/lib/actions/finance';

export function MovementButton({ products }: { products: { id: string; name: string; quantity: number; unit_of_measure: string }[] }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [v, setV] = React.useState({ product_id: products[0]?.id ?? '', type: 'in', quantity: '', unit_cost: '', notes: '' });
  const [pending, setPending] = React.useState(false);
  const p = products.find((x) => x.id === v.product_id);
  return (
    <>
      <Button onClick={() => setOpen(true)} disabled={!products.length}><ArrowLeftRight /> Movimentar estoque</Button>
      <Dialog open={open} onOpenChange={setOpen} size="sm" title="Movimentação de estoque"
        footer={<><Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button><Button loading={pending} onClick={async () => {
          setPending(true);
          const r = await createInventoryMovement(v as any);
          setPending(false);
          if (!r.ok) { toast.error(r.error); return; }
          toast.success('Estoque atualizado.');
          setOpen(false); setV({ ...v, quantity: '', notes: '' });
          router.refresh();
        }}>Registrar</Button></>}>
        <div className="space-y-4">
          <Field label="Produto" htmlFor="mv-p"><Select id="mv-p" value={v.product_id} onChange={(e) => setV({ ...v, product_id: e.target.value })}>{products.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</Select></Field>
          {p && <p className="text-sm text-muted-foreground">Saldo atual: <b>{p.quantity} {p.unit_of_measure}</b></p>}
          <Field label="Tipo" htmlFor="mv-t"><Select id="mv-t" value={v.type} onChange={(e) => setV({ ...v, type: e.target.value })}><option value="in">Entrada</option><option value="out">Saída (uso)</option><option value="loss">Perda</option><option value="adjustment">Ajuste (+/−)</option></Select></Field>
          <Field label="Quantidade" htmlFor="mv-q" hint={v.type === 'adjustment' ? 'Use número negativo para reduzir.' : undefined}><Input id="mv-q" inputMode="decimal" value={v.quantity} onChange={(e) => setV({ ...v, quantity: e.target.value })} /></Field>
          {v.type === 'in' && <Field label="Custo unitário" htmlFor="mv-c"><Input id="mv-c" inputMode="decimal" value={v.unit_cost} onChange={(e) => setV({ ...v, unit_cost: e.target.value })} /></Field>}
          <Field label="Observação" htmlFor="mv-n"><Textarea id="mv-n" rows={2} value={v.notes} onChange={(e) => setV({ ...v, notes: e.target.value })} /></Field>
        </div>
      </Dialog>
    </>
  );
}

export function SellButton({ products, patients }: { products: { id: string; name: string; price: number | null; quantity: number }[]; patients: { value: string; label: string }[] }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [v, setV] = React.useState({ product_id: products[0]?.id ?? '', quantity: '1', patient_id: '', price: '' });
  if (!products.length) return null;
  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}><ShoppingBag /> Vender produto</Button>
      <Dialog open={open} onOpenChange={setOpen} size="sm" title="Venda de produto" description="Baixa o estoque e gera uma conta a receber."
        footer={<Button onClick={async () => {
          const r = await sellProduct(v.product_id, Number(v.quantity.replace(',', '.')), v.patient_id || null, v.price ? Number(v.price.replace(',', '.')) : null);
          if (!r.ok) { toast.error(r.error); return; }
          toast.success('Venda registrada. Receba o pagamento em Financeiro → Contas a receber.');
          setOpen(false); router.refresh();
        }}>Registrar venda</Button>}>
        <div className="space-y-4">
          <Field label="Produto" htmlFor="sl-p"><Select id="sl-p" value={v.product_id} onChange={(e) => setV({ ...v, product_id: e.target.value })}>{products.map((x) => <option key={x.id} value={x.id}>{x.name} (estoque {x.quantity})</option>)}</Select></Field>
          <Field label="Quantidade" htmlFor="sl-q"><Input id="sl-q" inputMode="decimal" value={v.quantity} onChange={(e) => setV({ ...v, quantity: e.target.value })} /></Field>
          <Field label="Preço unitário" htmlFor="sl-pr" hint="Vazio = preço cadastrado."><Input id="sl-pr" inputMode="decimal" value={v.price} onChange={(e) => setV({ ...v, price: e.target.value })} /></Field>
          <Field label="Aluno (opcional)" htmlFor="sl-a"><Select id="sl-a" value={v.patient_id} onChange={(e) => setV({ ...v, patient_id: e.target.value })}><option value="">—</option>{patients.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}</Select></Field>
        </div>
      </Dialog>
    </>
  );
}

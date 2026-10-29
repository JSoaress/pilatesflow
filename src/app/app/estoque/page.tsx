import { AlertTriangle } from 'lucide-react';
import { requirePermission } from '@/lib/auth/context';
import { PageHeader, Table, Th, Td, Tr, EmptyState } from '@/components/ui/misc';
import { TabLinks } from '@/components/ui/tab-links';
import { ResourceSection } from '@/components/resource/resource-page';
import { MovementButton, SellButton } from '@/components/app/inventory/movement-dialog';
import { dateTime, number } from '@/lib/format';
import { inventoryMovementType, label } from '@/lib/labels';

export const metadata = { title: 'Estoque' };

export default async function InventoryPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const ctx = await requirePermission('inventory.view');
  const sp = await searchParams;
  const tab = ['movimentacoes', 'fornecedores'].includes(sp.aba) ? sp.aba : 'produtos';
  const { data: products } = await ctx.supabase.from('inventory_products').select('id, name, quantity, min_quantity, unit_of_measure, price, is_for_sale').eq('organization_id', ctx.org.id).is('deleted_at', null).eq('is_active', true).order('name');
  const low = ((products ?? []) as any[]).filter((p) => Number(p.quantity) <= Number(p.min_quantity));
  let movements: any[] = [];
  if (tab === 'movimentacoes') {
    const { data } = await ctx.supabase.from('inventory_movements').select('id, type, quantity, unit_cost, unit_price, notes, occurred_at, inventory_products(name, unit_of_measure)').eq('organization_id', ctx.org.id).order('occurred_at', { ascending: false }).limit(200);
    movements = data ?? [];
  }
  const { data: patients } = ctx.can('finance.create') ? await ctx.supabase.from('patients').select('id, full_name').eq('organization_id', ctx.org.id).is('deleted_at', null).in('status', ['active', 'trial', 'paused']).order('full_name') : { data: [] };
  return (
    <>
      <PageHeader title="Estoque" description="Produtos, movimentações e fornecedores."
        actions={ctx.can('inventory.edit') ? <>
          {ctx.can('finance.create') && <SellButton products={((products ?? []) as any[]).filter((p) => p.is_for_sale)} patients={((patients ?? []) as any[]).map((p) => ({ value: p.id, label: p.full_name }))} />}
          <MovementButton products={(products ?? []) as any[]} />
        </> : undefined} />
      {low.length > 0 && (
        <div className="mb-4 flex items-start gap-2 rounded-xl border border-warning/40 bg-warning-soft/50 p-3 text-sm" role="status">
          <AlertTriangle className="mt-0.5 h-4 w-4 text-warning" />
          <span><b>Estoque baixo:</b> {low.map((p) => `${p.name} (${number(p.quantity, 2)} ${p.unit_of_measure})`).join(', ')}</span>
        </div>
      )}
      <TabLinks base="/app/estoque" active={tab} tabs={[{ id: 'produtos', label: 'Produtos' }, { id: 'movimentacoes', label: 'Movimentações' }, { id: 'fornecedores', label: 'Fornecedores' }]} />
      {tab === 'produtos' && <ResourceSection resource="inventory_products" searchParams={sp} />}
      {tab === 'fornecedores' && <ResourceSection resource="suppliers" searchParams={sp} />}
      {tab === 'movimentacoes' && (movements.length === 0 ? <EmptyState title="Nenhuma movimentação" /> : (
        <Table>
          <thead><tr><Th>Data</Th><Th>Produto</Th><Th>Tipo</Th><Th>Quantidade</Th><Th>Observação</Th></tr></thead>
          <tbody>
            {movements.map((m) => (
              <Tr key={m.id}>
                <Td className="whitespace-nowrap">{dateTime(m.occurred_at, ctx.tz)}</Td>
                <Td>{m.inventory_products?.name}</Td>
                <Td>{label(inventoryMovementType, m.type)}</Td>
                <Td className="tabular-nums">{m.type === 'in' || (m.type === 'adjustment' && m.quantity > 0) ? '+' : '−'}{number(Math.abs(m.quantity), 2)} {m.inventory_products?.unit_of_measure}</Td>
                <Td className="text-muted-foreground">{m.notes ?? '—'}</Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      ))}
    </>
  );
}

'use server';
import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { runAction, must } from './safe-action';

const schema = z.object({
  product_id: z.string().uuid('Selecione o produto.'),
  type: z.enum(['in', 'out', 'adjustment', 'loss']),
  quantity: z.preprocess((v) => Number(String(v).replace(',', '.')), z.number().refine((n) => n !== 0 && Number.isFinite(n), 'Informe a quantidade.')),
  unit_cost: z.preprocess((v) => (v === '' || v == null ? null : Number(String(v).replace(',', '.'))), z.number().min(0).nullable()),
  notes: z.string().max(300).optional().nullable(),
}).refine((d) => d.type === 'adjustment' || d.quantity > 0, { message: 'A quantidade deve ser positiva (use "Ajuste" para corrigir para menos).', path: ['quantity'] });

/** Entrada, saída, perda ou ajuste de estoque (o saldo é atualizado no banco). */
export async function createInventoryMovement(input: z.input<typeof schema>) {
  return runAction({ permission: 'inventory.edit', schema, input }, async (ctx, d) => {
    must(await ctx.supabase.from('inventory_movements').insert({ ...d, organization_id: ctx.org.id }));
    revalidatePath('/app/estoque');
  });
}

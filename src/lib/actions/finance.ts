'use server';
import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { runAction, must, UserError } from './safe-action';
import { localToISO, todayISO } from '@/lib/format';
import { getPaymentProvider } from '@/lib/integrations/payments';

const METHODS = ['pix', 'cash', 'credit_card', 'debit_card', 'boleto', 'transfer', 'other'] as const;
const num = (label: string) => z.preprocess((v) => (typeof v === 'string' ? Number(v.replace(/\./g, '').replace(',', '.')) : v), z.number({ error: `Informe ${label}.` }).positive(`Informe ${label}.`).max(10_000_000));

const subSchema = z.object({
  patient_id: z.string().uuid(),
  plan_id: z.string({ error: 'Selecione o plano.' }).uuid('Selecione o plano.'),
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Informe a data de início.'),
  custom_price: z.preprocess((v) => (v === '' || v === null || v === undefined ? null : Number(String(v).replace(',', '.'))), z.number().min(0).nullable()),
  discount_percent: z.preprocess((v) => (v === '' || v === null || v === undefined ? null : Number(String(v).replace(',', '.'))), z.number().min(0).max(100).nullable()),
  due_day: z.preprocess((v) => (v === '' || v === null || v === undefined ? null : Number(v)), z.number().int().min(1).max(28).nullable()),
  generate_receivables: z.boolean().default(true),
  generate_contract: z.boolean().default(false),
  seller_staff_id: z.preprocess((v) => (v === '' ? null : v), z.string().uuid().nullable().optional()),
  notes: z.string().max(1000).optional().nullable(),
});

/** Contrata plano: assinatura + parcelas (+ contrato opcional). */
export async function createSubscription(input: z.input<typeof subSchema>) {
  return runAction({ permission: 'plans.create', schema: subSchema, input }, async (ctx, d) => {
    const id = must(await ctx.supabase.rpc('create_subscription', {
      p_patient_id: d.patient_id, p_plan_id: d.plan_id, p_start_date: d.start_date, p_custom_price: d.custom_price,
      p_discount_percent: d.discount_percent, p_due_day: d.due_day, p_generate_receivables: d.generate_receivables, p_notes: d.notes ?? null,
    })) as string;
    if (d.seller_staff_id) await ctx.supabase.from('subscriptions').update({ seller_staff_id: d.seller_staff_id }).eq('id', id);
    let contractId: string | null = null;
    if (d.generate_contract && ctx.can('contracts.create')) {
      contractId = must(await ctx.supabase.rpc('generate_contract', { p_subscription_id: id, p_template_id: null })) as string;
    }
    revalidatePath('/app', 'layout');
    return { id, contractId };
  });
}

export async function changeSubscriptionStatus(id: string, status: 'active' | 'paused' | 'cancelled', reason?: string, pausedUntil?: string, cancelOpen = false) {
  return runAction({ permission: 'plans.edit' }, async (ctx) => {
    must(await ctx.supabase.rpc('change_subscription_status', { p_id: id, p_status: status, p_reason: reason ?? null, p_paused_until: pausedUntil ?? null, p_cancel_open_receivables: cancelOpen }));
    revalidatePath('/app', 'layout');
  });
}

const paySchema = z.object({
  receivable_id: z.string().uuid(),
  amount: num('o valor recebido'),
  method: z.enum(METHODS, { error: 'Selecione a forma de pagamento.' }),
  paid_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Informe a data do pagamento.'),
  cash_account_id: z.preprocess((v) => (v === '' ? null : v), z.string().uuid().nullable().optional()),
  notes: z.string().max(500).optional().nullable(),
});

/** Baixa manual de recebimento (gera movimento de caixa e número de recibo). */
export async function registerPayment(input: z.input<typeof paySchema>) {
  return runAction({ permission: 'finance.create', schema: paySchema, input }, async (ctx, d) => {
    const paidAt = d.paid_on === todayISO(ctx.tz) ? new Date().toISOString() : localToISO(d.paid_on, '12:00', ctx.tz);
    const id = must(await ctx.supabase.rpc('register_payment', {
      p_receivable_id: d.receivable_id, p_amount: d.amount, p_method: d.method, p_paid_at: paidAt, p_cash_account_id: d.cash_account_id ?? null, p_notes: d.notes ?? null,
    })) as string;
    revalidatePath('/app', 'layout');
    return { paymentId: id };
  });
}

export async function refundPayment(paymentId: string, reason: string) {
  return runAction({ permission: 'finance.refund' }, async (ctx) => {
    if (!reason?.trim()) throw new UserError('Informe o motivo do estorno.');
    must(await ctx.supabase.rpc('refund_payment', { p_payment_id: paymentId, p_reason: reason.trim() }));
    revalidatePath('/app', 'layout');
  });
}

export async function cancelReceivable(id: string, reason: string) {
  return runAction({ permission: 'finance.edit' }, async (ctx) => {
    must(await ctx.supabase.rpc('cancel_receivable', { p_id: id, p_reason: reason }));
    revalidatePath('/app', 'layout');
  });
}

const arSchema = z.object({
  patient_id: z.preprocess((v) => (v === '' ? null : v), z.string().uuid().nullable().optional()),
  description: z.string().trim().min(2, 'Informe a descrição.').max(200),
  amount: num('o valor'),
  due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Informe o vencimento.'),
  category_id: z.preprocess((v) => (v === '' ? null : v), z.string().uuid().nullable().optional()),
  payment_method: z.preprocess((v) => (v === '' ? null : v), z.enum(METHODS).nullable().optional()),
  installments: z.preprocess((v) => (v === '' || v === undefined ? 1 : Number(v)), z.number().int().min(1).max(24)),
  notes: z.string().max(1000).optional().nullable(),
});

/** Lançamento manual de conta a receber (avulsa, avaliação, produto...). Parcelamento opcional. */
export async function createReceivable(input: z.input<typeof arSchema>) {
  return runAction({ permission: 'finance.create', schema: arSchema, input }, async (ctx, d) => {
    const n = d.installments;
    const base = Math.floor((d.amount / n) * 100) / 100;
    const rows = Array.from({ length: n }, (_, i) => {
      const [y, m, day] = d.due_date.split('-').map(Number);
      const due = new Date(Date.UTC(y, m - 1 + i, Math.min(day, 28)));
      return {
        organization_id: ctx.org.id, unit_id: ctx.unitId ?? ctx.units[0]?.id ?? null, patient_id: d.patient_id ?? null,
        description: n > 1 ? `${d.description} — parcela ${i + 1}/${n}` : d.description,
        amount: i === n - 1 ? Math.round((d.amount - base * (n - 1)) * 100) / 100 : base,
        due_date: i === 0 ? d.due_date : due.toISOString().slice(0, 10), competence_date: d.due_date,
        category_id: d.category_id ?? null, payment_method: d.payment_method ?? null, notes: d.notes ?? null,
        installment_number: n > 1 ? i + 1 : null, installment_count: n > 1 ? n : null,
      } as Record<string, unknown>;
    }).map((r) => ({ ...r, status: String(r.due_date) < todayISO(ctx.tz) ? 'overdue' : 'pending' }));
    must(await ctx.supabase.from('accounts_receivable').insert(rows));
    revalidatePath('/app', 'layout');
  });
}

export async function payPayable(id: string, input: { paid_on: string; amount?: string | number; method?: string; cash_account_id?: string | null }) {
  return runAction({ permission: 'finance.edit' }, async (ctx) => {
    const amount = input.amount === '' || input.amount === undefined ? null : Number(String(input.amount).replace(',', '.'));
    if (amount !== null && (!Number.isFinite(amount) || amount <= 0)) throw new UserError('Valor inválido.');
    must(await ctx.supabase.rpc('pay_payable', { p_id: id, p_paid_at: input.paid_on, p_amount: amount, p_method: input.method || null, p_cash_account_id: input.cash_account_id || null }));
    revalidatePath('/app', 'layout');
  });
}

export async function cancelPayable(id: string, reason: string) {
  return runAction({ permission: 'finance.edit' }, async (ctx) => {
    must(await ctx.supabase.rpc('cancel_payable', { p_id: id, p_reason: reason }));
    revalidatePath('/app', 'layout');
  });
}

const cashSchema = z.object({
  type: z.enum(['in', 'out']),
  amount: num('o valor'),
  occurred_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  description: z.string().trim().min(2, 'Informe a descrição.').max(200),
  category_id: z.preprocess((v) => (v === '' ? null : v), z.string().uuid().nullable().optional()),
  cash_account_id: z.preprocess((v) => (v === '' ? null : v), z.string().uuid().nullable().optional()),
  source: z.enum(['manual', 'adjustment']).default('manual'),
});

export async function createCashMovement(input: z.input<typeof cashSchema>) {
  return runAction({ permission: 'finance.create', schema: cashSchema, input }, async (ctx, d) => {
    must(await ctx.supabase.from('cash_movements').insert({ ...d, organization_id: ctx.org.id, unit_id: ctx.unitId ?? ctx.units[0]?.id ?? null }));
    revalidatePath('/app/financeiro', 'layout');
  });
}

export async function generateContract(subscriptionId: string) {
  return runAction({ permission: 'contracts.create' }, async (ctx) => {
    const id = must(await ctx.supabase.rpc('generate_contract', { p_subscription_id: subscriptionId, p_template_id: null })) as string;
    revalidatePath('/app', 'layout');
    return { id };
  });
}

export async function setContractStatus(id: string, status: 'sent' | 'cancelled') {
  return runAction({ permission: 'contracts.edit' }, async (ctx) => {
    const patch = status === 'sent' ? { status, sent_at: new Date().toISOString() } : { status, cancelled_at: new Date().toISOString() };
    must(await ctx.supabase.from('contracts').update(patch).eq('id', id).eq('organization_id', ctx.org.id).in('status', status === 'sent' ? ['draft'] : ['draft', 'sent']));
    revalidatePath('/app', 'layout');
  });
}

/** Gera cobrança Pix/boleto/link no gateway configurado. Não simula: exige credenciais reais. */
export async function createGatewayCharge(receivableId: string, method: 'pix' | 'boleto' | 'link') {
  return runAction({ permission: 'finance.create' }, async (ctx) => {
    const { data: integ } = await ctx.supabase.from('integrations').select('provider, status, enabled').eq('organization_id', ctx.org.id)
      .in('provider', ['asaas', 'mercadopago', 'stripe']).eq('status', 'connected').eq('enabled', true).limit(1).maybeSingle();
    if (!integ) throw new UserError('Nenhum provedor de pagamento conectado. Configure em Configurações → Integrações.');
    const provider = getPaymentProvider(integ.provider as 'asaas' | 'mercadopago' | 'stripe');
    if (!provider.isConfigured()) throw new UserError('As credenciais do provedor de pagamento não estão configuradas no servidor.');
    const ar = must(await ctx.supabase.from('v_receivables').select('*').eq('id', receivableId).eq('organization_id', ctx.org.id).single()) as any;
    const charge = await provider.createCharge({
      amount: Number(ar.open_amount), dueDate: ar.due_date, description: ar.description, method, externalReference: ar.id,
      customer: { name: ar.patient_name ?? 'Cliente', email: ar.patient_email, phone: ar.patient_whatsapp ?? ar.patient_phone },
    });
    const { createAdminClient } = await import('@/lib/supabase/admin');
    must(await createAdminClient().from('payment_gateway_charges').insert({
      organization_id: ctx.org.id, receivable_id: ar.id, provider: integ.provider, external_id: charge.externalId, method,
      status: 'pending', amount: ar.open_amount, due_date: ar.due_date, pix_copy_paste: charge.pixCopyPaste ?? null,
      pix_qr_image: charge.pixQrImage ?? null, payment_url: charge.paymentUrl ?? null, raw: charge.raw ?? null,
    }));
    revalidatePath('/app', 'layout');
    return charge;
  });
}

export async function calculateCommissions(month: string) {
  return runAction({ permission: 'commissions.create' }, async (ctx) => {
    const n = must(await ctx.supabase.rpc('calculate_commissions', { p_org: ctx.org.id, p_month: `${month}-01` })) as number;
    revalidatePath('/app/financeiro/comissoes');
    return { count: n };
  });
}

export async function setCommissionStatus(id: string, status: 'approved' | 'paid' | 'cancelled') {
  return runAction({ permission: 'commissions.edit' }, async (ctx) => {
    const patch: Record<string, unknown> = { status };
    if (status === 'approved') patch.approved_by = ctx.user.id;
    if (status === 'paid') patch.paid_at = new Date().toISOString();
    must(await ctx.supabase.from('commissions').update(patch).eq('id', id).eq('organization_id', ctx.org.id));
    revalidatePath('/app/financeiro/comissoes');
  });
}

export async function sellProduct(productId: string, quantity: number, patientId?: string | null, unitPrice?: number | null) {
  return runAction({ permission: ['inventory.edit'] }, async (ctx) => {
    if (!(quantity > 0)) throw new UserError('Informe a quantidade.');
    const id = must(await ctx.supabase.rpc('sell_product', { p_product_id: productId, p_quantity: quantity, p_patient_id: patientId ?? null, p_unit_price: unitPrice ?? null, p_due_date: todayISO(ctx.tz) })) as string;
    revalidatePath('/app', 'layout');
    return { receivableId: id };
  });
}

/** Anexa comprovante a uma conta a pagar (armazenamento privado). */
export async function uploadPayableReceipt(id: string, fd: FormData) {
  return runAction({ permission: 'finance.edit' }, async (ctx) => {
    const file = fd.get('file');
    if (!(file instanceof File) || !file.size) throw new UserError('Selecione o arquivo.');
    if (!['application/pdf', 'image/jpeg', 'image/png', 'image/webp'].includes(file.type)) throw new UserError('Envie PDF, JPG ou PNG.');
    if (file.size > 10 * 1024 * 1024) throw new UserError('Arquivo muito grande (máx. 10 MB).');
    const ext = (file.name.split('.').pop() ?? 'pdf').toLowerCase().replace(/[^a-z0-9]/g, '');
    const path = `${ctx.org.id}/payables/${id}/${Date.now()}.${ext}`;
    must(await ctx.supabase.storage.from('documents').upload(path, file, { contentType: file.type }));
    must(await ctx.supabase.from('accounts_payable').update({ receipt_path: path }).eq('id', id).eq('organization_id', ctx.org.id));
    revalidatePath('/app/financeiro/pagar');
  });
}

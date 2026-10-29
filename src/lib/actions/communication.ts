'use server';
import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { runAction, must } from './safe-action';
import { dispatchQueuedMessages } from '@/lib/integrations/dispatcher';

const schema = z.object({
  patient_id: z.string().uuid().nullable().optional(),
  lead_id: z.string().uuid().nullable().optional(),
  channel: z.enum(['whatsapp', 'email', 'sms']),
  template_key: z.string().min(1),
  body: z.string().trim().min(2, 'Escreva a mensagem.').max(4000),
});

/** Coloca a mensagem na fila e tenta enviar imediatamente pelo canal oficial configurado. */
export async function sendMessageAction(input: z.input<typeof schema>) {
  return runAction({ permission: 'communication.create', schema, input }, async (ctx, d) => {
    const id = must(await ctx.supabase.rpc('queue_message', {
      p_org: ctx.org.id, p_template_key: d.template_key || 'custom', p_channel: d.channel, p_patient_id: d.patient_id ?? null, p_lead_id: d.lead_id ?? null,
      p_vars: {}, p_custom_body: d.body, p_scheduled_for: new Date().toISOString(), p_dedupe_key: null, p_related_entity: null, p_related_id: null,
    })) as string;
    const results = await dispatchQueuedMessages(5);
    const mine = results.find((r) => r.id === id);
    revalidatePath('/app', 'layout');
    if (mine && !mine.ok) return { id, sent: false, message: `Mensagem registrada, mas não enviada: ${mine.error}` };
    return { id, sent: !!mine?.ok, message: mine?.ok ? 'Mensagem enviada.' : 'Mensagem na fila de envio.' };
  });
}

export async function cancelQueuedMessage(id: string) {
  return runAction({ permission: 'communication.create' }, async (ctx) => {
    must(await ctx.supabase.from('messages').update({ status: 'cancelled' }).eq('id', id).eq('status', 'queued'));
    revalidatePath('/app/comunicacao');
  });
}

/** Envia cobrança (modelo "Mensalidade vencida") para o aluno pelo canal escolhido. */
export async function sendOverdueReminder(receivableId: string, channel: 'whatsapp' | 'email' | 'sms' = 'whatsapp') {
  return runAction({ permission: ['communication.create', 'finance.edit'] }, async (ctx) => {
    const { data: r } = await ctx.supabase.from('v_receivables').select('id, patient_id, open_amount, due_date').eq('id', receivableId).single();
    if (!r?.patient_id) throw new Error('Título sem aluno vinculado.');
    const vars = { valor: new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(r.open_amount)), vencimento: r.due_date.split('-').reverse().join('/') };
    must(await ctx.supabase.rpc('queue_message', { p_org: ctx.org.id, p_template_key: 'payment_overdue', p_channel: channel, p_patient_id: r.patient_id, p_lead_id: null, p_vars: vars,
      p_custom_body: null, p_scheduled_for: new Date().toISOString(), p_dedupe_key: `overdue-manual:${r.id}:${new Date().toISOString().slice(0, 10)}:${channel}`, p_related_entity: 'accounts_receivable', p_related_id: r.id }));
    await ctx.supabase.from('accounts_receivable').update({ last_contact_at: new Date().toISOString() }).eq('id', r.id);
    const results = await dispatchQueuedMessages(5);
    revalidatePath('/app/financeiro/inadimplencia');
    const failed = results.find((x) => !x.ok);
    return { message: failed ? `Cobrança registrada, mas não enviada: ${failed.error}` : 'Cobrança enviada.' };
  });
}

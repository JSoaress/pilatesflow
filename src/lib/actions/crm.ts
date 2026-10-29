'use server';
import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { runAction, must } from './safe-action';
import { localToISO } from '@/lib/format';

const STAGES = ['new', 'contacted', 'trial_scheduled', 'trial_done', 'negotiation', 'enrolled', 'lost'] as const;

export async function moveLead(id: string, stage: (typeof STAGES)[number], lostReason?: string) {
  return runAction({ permission: 'crm.edit', schema: z.enum(STAGES), input: stage }, async (ctx, s) => {
    const patch: Record<string, unknown> = { stage: s };
    if (s === 'lost') patch.lost_reason = lostReason ?? null;
    if (s === 'enrolled') patch.converted_at = new Date().toISOString();
    must(await ctx.supabase.from('leads').update(patch).eq('id', id).eq('organization_id', ctx.org.id));
    revalidatePath('/app/crm');
  });
}

export async function convertLead(id: string) {
  return runAction({ permission: 'patients.create' }, async (ctx) => {
    const patientId = must(await ctx.supabase.rpc('convert_lead_to_patient', { p_lead_id: id, p_status: 'trial' })) as string;
    revalidatePath('/app/crm');
    return { patientId };
  });
}

const trialSchema = z.object({
  unit_id: z.string().uuid(), service_id: z.string().uuid('Selecione a modalidade.'), staff_id: z.preprocess((v) => (v === '' ? null : v), z.string().uuid().nullable()),
  room_id: z.preprocess((v) => (v === '' ? null : v), z.string().uuid().nullable()), date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), start: z.string().regex(/^\d{2}:\d{2}$/),
  duration: z.coerce.number().int().min(10).max(240), override: z.boolean().default(false),
});

/** Agenda a aula experimental do lead (cria a ficha "Experimental" e o agendamento). */
export async function scheduleTrial(leadId: string, input: z.input<typeof trialSchema>) {
  return runAction({ permission: 'schedule.create', schema: trialSchema, input }, async (ctx, d) => {
    const starts = localToISO(d.date, d.start, ctx.tz);
    const ends = new Date(new Date(starts).getTime() + d.duration * 60000).toISOString();
    const id = must(await ctx.supabase.rpc('schedule_trial_class', { p_lead_id: leadId, p: { unit_id: d.unit_id, service_id: d.service_id, staff_id: d.staff_id, room_id: d.room_id, starts_at: starts, ends_at: ends, override: d.override } })) as string;
    revalidatePath('/app/crm');
    return { appointmentId: id };
  });
}

const outcomeSchema = z.object({ attended: z.boolean(), converted: z.boolean(), offered_plan_id: z.preprocess((v) => (v === '' ? null : v), z.string().uuid().nullable()), lost_reason: z.string().max(300).optional().nullable() });

export async function registerTrialOutcome(leadId: string, input: z.input<typeof outcomeSchema>) {
  return runAction({ permission: 'crm.edit', schema: outcomeSchema, input }, async (ctx, d) => {
    must(await ctx.supabase.rpc('register_trial_outcome', { p_lead_id: leadId, p_attended: d.attended, p_converted: d.converted, p_offered_plan_id: d.offered_plan_id, p_lost_reason: d.lost_reason || null }));
    revalidatePath('/app/crm');
  });
}

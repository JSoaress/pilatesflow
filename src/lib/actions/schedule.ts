'use server';
import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { runAction, must, UserError } from './safe-action';
import { addDaysISO, localToISO } from '@/lib/format';

const uuid = z.string().uuid();
const optUuid = z.preprocess((v) => (v === '' || v === undefined ? null : v), z.string().uuid().nullable());

const apptSchema = z.object({
  unit_id: uuid,
  service_id: z.string({ error: 'Selecione a modalidade.' }).uuid('Selecione a modalidade.'),
  staff_id: optUuid,
  room_id: optUuid,
  equipment_id: optUuid,
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Informe a data.'),
  start: z.string().regex(/^\d{2}:\d{2}$/, 'Informe o horário inicial.'),
  end: z.string().regex(/^\d{2}:\d{2}$/, 'Informe o horário final.'),
  capacity: z.preprocess((v) => (v === '' || v === undefined ? null : Number(v)), z.number().int().min(1).max(200).nullable()),
  kind: z.string().optional(),
  notes: z.string().max(2000).optional().nullable(),
  patient_ids: z.array(uuid).max(200).default([]),
  use_replacement_credit: z.boolean().default(false),
  override: z.boolean().default(false),
}).refine((d) => d.end > d.start, { message: 'O horário final deve ser depois do inicial.', path: ['end'] });

export type ApptInput = z.input<typeof apptSchema>;

function toPayload(d: z.infer<typeof apptSchema>, tz: string) {
  return {
    unit_id: d.unit_id, service_id: d.service_id, staff_id: d.staff_id, room_id: d.room_id, equipment_id: d.equipment_id,
    starts_at: localToISO(d.date, d.start, tz), ends_at: localToISO(d.date, d.end, tz), capacity: d.capacity ?? undefined,
    kind: d.kind || undefined, notes: d.notes || null, patient_ids: d.patient_ids, use_replacement_credit: d.use_replacement_credit, override: d.override,
  };
}

export type Conflict = { code: string; severity: 'error' | 'override'; message: string };

export async function checkConflicts(input: ApptInput & { exclude_id?: string | null }) {
  return runAction({ permission: 'schedule.view', schema: apptSchema, input }, async (ctx, d) => {
    const p = toPayload(d, ctx.tz);
    const res = must(await ctx.supabase.rpc('check_schedule_conflicts', {
      p_org: ctx.org.id, p_unit: p.unit_id, p_starts: p.starts_at, p_ends: p.ends_at, p_staff: p.staff_id, p_room: p.room_id,
      p_equipment: p.equipment_id, p_patient_ids: p.patient_ids, p_capacity: p.capacity ?? 1,
      p_exclude_appointment: (input as { exclude_id?: string }).exclude_id ?? null,
    })) as Conflict[];
    return { conflicts: res ?? [], canOverride: ctx.can('schedule.override') };
  });
}

export async function createAppointment(input: ApptInput) {
  return runAction({ permission: 'schedule.create', schema: apptSchema, input }, async (ctx, d) => {
    const id = must(await ctx.supabase.rpc('create_appointment', { p: toPayload(d, ctx.tz) })) as string;
    revalidatePath('/app/agenda');
    return { id };
  });
}

const moveSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  start: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  end: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  staff_id: optUuid.optional(),
  room_id: optUuid.optional(),
  equipment_id: optUuid.optional(),
  service_id: z.string().uuid().optional(),
  capacity: z.number().int().min(1).max(200).optional(),
  notes: z.string().max(2000).nullable().optional(),
  override: z.boolean().default(false),
});

/** Move/edita agendamento (inclusive arrastar e soltar). scope: 'one' | 'future'. */
export async function updateAppointment(id: string, input: z.input<typeof moveSchema>, scope: 'one' | 'future' = 'one') {
  return runAction({ permission: 'schedule.edit', schema: moveSchema, input }, async (ctx, d) => {
    const p: Record<string, unknown> = { override: d.override };
    if (d.date && d.start) p.starts_at = localToISO(d.date, d.start, ctx.tz);
    if (d.date && d.end) p.ends_at = localToISO(d.date, d.end, ctx.tz);
    for (const k of ['staff_id', 'room_id', 'equipment_id', 'service_id', 'capacity', 'notes'] as const) if (k in d) p[k] = d[k];
    const n = must(await ctx.supabase.rpc('update_appointment', { p_id: id, p, p_scope: scope })) as number;
    revalidatePath('/app/agenda');
    return { updated: n };
  });
}

export async function cancelAppointment(id: string, reason: string, kind: 'staff_absence' | 'holiday' | 'clinic' | 'other', scope: 'one' | 'future') {
  return runAction({ permission: 'schedule.edit' }, async (ctx) => {
    if (!reason?.trim()) throw new UserError('Informe o motivo do cancelamento.');
    const n = must(await ctx.supabase.rpc('cancel_appointment', { p_id: id, p_reason: reason.trim(), p_reason_kind: kind, p_scope: scope })) as number;
    revalidatePath('/app/agenda');
    return { cancelled: n };
  });
}

export async function addParticipant(appointmentId: string, patientId: string, useCredit = false, override = false) {
  return runAction({ permission: 'schedule.create' }, async (ctx) => {
    must(await ctx.supabase.rpc('add_participant', { p_appointment_id: appointmentId, p_patient_id: patientId, p_use_credit: useCredit, p_override: override }));
    revalidatePath('/app/agenda');
  });
}

export async function cancelParticipation(participantId: string, reason?: string) {
  return runAction({ permission: 'schedule.edit' }, async (ctx) => {
    const r = must(await ctx.supabase.rpc('cancel_participation', { p_participant_id: participantId, p_reason: reason ?? null })) as { message: string; with_notice: boolean };
    revalidatePath('/app', 'layout');
    return r;
  });
}

export async function setAttendance(participantId: string, status: 'scheduled' | 'confirmed' | 'present' | 'completed' | 'absent') {
  return runAction({ permission: 'schedule.edit' }, async (ctx) => {
    must(await ctx.supabase.rpc('set_attendance', { p_participant_id: participantId, p_status: status, p_method: 'manual' }));
    revalidatePath('/app', 'layout');
  });
}

export async function joinWaitlist(appointmentId: string, patientId: string) {
  return runAction({ permission: 'schedule.create' }, async (ctx) => {
    must(await ctx.supabase.rpc('join_waitlist', { p_appointment_id: appointmentId, p_patient_id: patientId }));
    revalidatePath('/app/agenda');
  });
}

export async function cancelWaitlist(id: string) {
  return runAction({ permission: 'schedule.edit' }, async (ctx) => {
    must(await ctx.supabase.from('waitlist').update({ status: 'cancelled' }).eq('id', id).eq('organization_id', ctx.org.id));
    revalidatePath('/app/agenda');
  });
}

const fixedSchema = z.object({
  unit_id: uuid,
  service_id: z.string({ error: 'Selecione a modalidade.' }).uuid('Selecione a modalidade.'),
  staff_id: optUuid,
  room_id: optUuid,
  equipment_id: optUuid,
  weekdays: z.array(z.coerce.number().int().min(0).max(6)).min(1, 'Selecione ao menos um dia da semana.'),
  start_time: z.string().regex(/^\d{2}:\d{2}$/, 'Informe o horário.'),
  duration_min: z.coerce.number().int().min(5).max(480),
  capacity: z.coerce.number().int().min(1).max(200),
  starts_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Informe a data de início.'),
  ends_on: z.preprocess((v) => (v === '' ? null : v), z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional()),
  patient_ids: z.array(uuid).max(200).default([]),
  name: z.string().max(80).optional().nullable(),
  notes: z.string().max(1000).optional().nullable(),
  override: z.boolean().default(false),
});

/** Horário fixo semanal (ex.: Maria seg e qua 18:00) — gera as próximas aulas automaticamente. */
export async function createFixedSchedule(input: z.input<typeof fixedSchema>) {
  return runAction({ permission: 'schedule.create', schema: fixedSchema, input }, async (ctx, d) => {
    const ids = must(await ctx.supabase.rpc('create_fixed_schedule', { p: d })) as string[];
    revalidatePath('/app', 'layout');
    return { ids };
  });
}

export async function updateRecurrenceMember(memberId: string, action: 'pause' | 'resume' | 'end', from: string, until?: string | null) {
  return runAction({ permission: 'schedule.edit' }, async (ctx) => {
    const n = must(await ctx.supabase.rpc('update_recurrence_member', { p_member_id: memberId, p_action: action, p_from: from, p_until: until ?? null })) as number;
    revalidatePath('/app', 'layout');
    return { affected: n };
  });
}

export async function pauseRecurrence(recurrenceId: string, from: string, until: string) {
  return runAction({ permission: 'schedule.edit' }, async (ctx) => {
    const n = must(await ctx.supabase.rpc('pause_recurrence', { p_recurrence_id: recurrenceId, p_from: from, p_until: until })) as number;
    revalidatePath('/app/agenda');
    return { affected: n };
  });
}

export async function resumeRecurrence(recurrenceId: string) {
  return runAction({ permission: 'schedule.edit' }, async (ctx) => {
    must(await ctx.supabase.rpc('resume_recurrence', { p_recurrence_id: recurrenceId }));
    revalidatePath('/app/agenda');
  });
}

export async function grantManualCredit(patientId: string, notes: string) {
  return runAction({ permission: 'schedule.override' }, async (ctx) => {
    must(await ctx.supabase.rpc('grant_manual_credit', { p_patient_id: patientId, p_notes: notes }));
    revalidatePath('/app', 'layout');
  });
}

export async function checkInByToken(token: string) {
  return runAction({ permission: 'schedule.edit' }, async (ctx) => {
    const t = token.replace(/^pilatesflow:checkin:/, '').trim();
    if (!z.string().uuid().safeParse(t).success) throw new UserError('QR Code inválido.');
    return must(await ctx.supabase.rpc('check_in', { p_org: ctx.org.id, p_token: t, p_pin: null, p_patient_id: null })) as { patient: string; starts_at: string };
  });
}

export async function checkInByPin(patientId: string, pin: string) {
  return runAction({ permission: 'schedule.edit' }, async (ctx) => {
    if (!/^\d{4,6}$/.test(pin)) throw new UserError('PIN inválido.');
    return must(await ctx.supabase.rpc('check_in', { p_org: ctx.org.id, p_token: null, p_pin: pin, p_patient_id: patientId })) as { patient: string; starts_at: string };
  });
}

export type AgendaAppointment = {
  id: string; starts_at: string; ends_at: string; status: string; kind: string; capacity: number; notes: string | null;
  unit_id: string; service_id: string; staff_id: string | null; room_id: string | null; equipment_id: string | null; recurrence_id: string | null;
  is_exception: boolean; substitute_for_staff_id: string | null; cancel_reason: string | null;
  participants: { id: string; patient_id: string; status: string; replacement_credit_id: string | null; notes: string | null; patient: { full_name: string; social_name: string | null; whatsapp: string | null; phone: string | null } }[];
  waitlist: { id: string; patient_id: string; status: string; position: number; patient: { full_name: string } }[];
};

/** Carrega a agenda do período (usada pela tela de agenda e atualizações após arrastar). */
export async function loadAgenda(fromDate: string, toDate: string, unitId?: string | null) {
  return runAction({ permission: 'schedule.view' }, async (ctx) => {
    const from = localToISO(fromDate, '00:00', ctx.tz);
    const to = localToISO(addDaysISO(toDate, 1), '00:00', ctx.tz);
    let q = ctx.supabase.from('appointments')
      .select('id, starts_at, ends_at, status, kind, capacity, notes, unit_id, service_id, staff_id, room_id, equipment_id, recurrence_id, is_exception, substitute_for_staff_id, cancel_reason, participants:appointment_participants(id, patient_id, status, replacement_credit_id, notes, patient:patients(full_name, social_name, whatsapp, phone)), waitlist(id, patient_id, status, position, patient:patients(full_name))')
      .eq('organization_id', ctx.org.id).gte('starts_at', from).lt('starts_at', to).order('starts_at').limit(3000);
    const unit = unitId ?? ctx.unitId;
    if (unit) q = q.eq('unit_id', unit);
    return (must(await q) ?? []) as unknown as AgendaAppointment[];
  });
}

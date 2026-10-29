'use server';
import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { friendlyError } from '@/lib/errors';
import { password } from '@/lib/validation/common';

type Res<T = unknown> = { ok: true; data?: T; message?: string } | { ok: false; error: string };

async function call<T>(fn: string, args: Record<string, unknown>, path = '/portal'): Promise<Res<T>> {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return { ok: false, error: 'Sua sessão expirou. Entre novamente.' };
  const { data, error } = await supabase.rpc(fn, args);
  if (error) return { ok: false, error: friendlyError(error) };
  revalidatePath(path, 'layout');
  return { ok: true, data: data as T };
}

const uuid = (v: string) => z.string().uuid().safeParse(v).success;

export async function portalConfirm(participantId: string) {
  if (!uuid(participantId)) return { ok: false, error: 'Inválido.' } as Res;
  return call('portal_confirm', { p_participant_id: participantId });
}
export async function portalCancel(participantId: string, reason?: string) {
  if (!uuid(participantId)) return { ok: false, error: 'Inválido.' } as Res;
  return call<{ message: string }>('cancel_participation', { p_participant_id: participantId, p_reason: reason ?? 'Cancelado pelo aluno no portal' });
}
export async function portalSlots(patientId: string, serviceId: string, date: string) {
  return call<any[]>('portal_available_slots', { p_patient_id: patientId, p_service: serviceId, p_date: date });
}
export async function portalFullClasses(patientId: string, serviceId: string, date: string) {
  return call<any[]>('portal_full_classes', { p_patient_id: patientId, p_service: serviceId, p_date: date });
}
export async function portalBook(patientId: string, appointmentId: string, useCredit: boolean) {
  return call('portal_book', { p_patient_id: patientId, p_appointment_id: appointmentId, p_use_credit: useCredit });
}
export async function portalJoinWaitlist(patientId: string, appointmentId: string) {
  return call('portal_join_waitlist', { p_patient_id: patientId, p_appointment_id: appointmentId });
}
export async function portalLeaveWaitlist(id: string) {
  return call('portal_leave_waitlist', { p_waitlist_id: id });
}
export async function portalAcceptContract(contractId: string, name: string) {
  return call('portal_accept_contract', { p_contract_id: contractId, p_name: name });
}
export async function portalSignDocument(documentId: string, name: string) {
  return call('portal_sign_document', { p_document_id: documentId, p_name: name });
}
export async function portalSubmitAnamnesis(id: string, answers: Record<string, unknown>, signature: string) {
  return call('submit_anamnesis', { p_id: id, p_answers: answers, p_signature_name: signature });
}

const profileSchema = z.object({
  social_name: z.string().max(120).optional(), phone: z.string().max(30).optional(), whatsapp: z.string().max(30).optional(), email: z.string().max(160).optional(),
  address_zip: z.string().max(10).optional(), address_street: z.string().max(160).optional(), address_number: z.string().max(20).optional(),
  address_complement: z.string().max(80).optional(), address_district: z.string().max(80).optional(), address_city: z.string().max(80).optional(), address_state: z.string().max(2).optional(),
});
export async function portalUpdateProfile(patientId: string, input: z.input<typeof profileSchema>) {
  const parsed = profileSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message } as Res;
  return call('portal_update_profile', { p_patient_id: patientId, p: parsed.data });
}

export async function portalChangePassword(newPassword: string): Promise<Res> {
  const p = password.safeParse(newPassword);
  if (!p.success) return { ok: false, error: p.error.issues[0].message };
  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) return { ok: false, error: friendlyError(error) };
  await supabase.auth.signOut({ scope: 'others' });
  return { ok: true, message: 'Senha alterada. Outras sessões foram encerradas.' };
}

export async function markPortalNotificationsRead() {
  return call('mark_notifications_read', { p_ids: null });
}

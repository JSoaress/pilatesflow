'use server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { patientSchema } from '@/lib/validation/patient';
import { createAdminClient } from '@/lib/supabase/admin';
import { env } from '@/lib/env';
import { runAction, must, UserError } from './safe-action';
import { ALLOWED_UPLOADS, safeFileName } from '@/lib/storage';

function patientRow(d: z.infer<typeof patientSchema>) {
  const { emergency_name, emergency_relationship, emergency_phone, ...rest } = d;
  void emergency_name; void emergency_relationship; void emergency_phone;
  return { ...rest, address_state: rest.address_state ? rest.address_state.toUpperCase() : null };
}

export async function createPatient(input: unknown) {
  return runAction({ permission: 'patients.create', schema: patientSchema, input }, async (ctx, d) => {
    const row = must(await ctx.supabase.from('patients').insert({
      ...patientRow(d), organization_id: ctx.org.id, unit_id: d.unit_id ?? ctx.unitId ?? ctx.units[0]?.id ?? null, registered_by: ctx.user.id,
    }).select('id').single()) as { id: string };
    if (d.emergency_name && d.emergency_phone) {
      must(await ctx.supabase.from('emergency_contacts').insert({ organization_id: ctx.org.id, patient_id: row.id, name: d.emergency_name, relationship: d.emergency_relationship, phone: d.emergency_phone }));
    }
    revalidatePath('/app/alunos');
    return { id: row.id };
  });
}

export async function updatePatient(id: string, input: unknown) {
  return runAction({ permission: 'patients.edit', schema: patientSchema, input }, async (ctx, d) => {
    must(await ctx.supabase.from('patients').update(patientRow(d)).eq('id', id).eq('organization_id', ctx.org.id));
    revalidatePath(`/app/alunos/${id}`);
    return { id };
  });
}

export async function setPatientStatus(id: string, status: string) {
  return runAction({ permission: 'patients.edit', schema: z.enum(['lead', 'trial', 'active', 'paused', 'inactive', 'cancelled']), input: status }, async (ctx, s) => {
    must(await ctx.supabase.from('patients').update({ status: s }).eq('id', id).eq('organization_id', ctx.org.id));
    revalidatePath(`/app/alunos/${id}`);
  });
}

export async function archivePatient(id: string) {
  return runAction({ permission: 'patients.delete' }, async (ctx) => {
    must(await ctx.supabase.from('patients').update({ deleted_at: new Date().toISOString(), status: 'inactive' }).eq('id', id).eq('organization_id', ctx.org.id));
    revalidatePath('/app/alunos');
  });
}

/** Envia convite de acesso ao Portal do Aluno (cria usuário no Auth e vincula ao cadastro). */
export async function invitePatientToPortal(id: string) {
  return runAction({ permission: 'patients.edit' }, async (ctx) => {
    const p = must(await ctx.supabase.from('patients').select('id, email, full_name, user_id').eq('id', id).eq('organization_id', ctx.org.id).single()) as { id: string; email: string | null; full_name: string; user_id: string | null };
    if (!p.email) throw new UserError('Cadastre o e-mail do aluno antes de enviar o convite.');
    if (p.user_id) throw new UserError('Este aluno já possui acesso ao portal.');
    const admin = createAdminClient();
    let userId: string | null = null;
    const invite = await admin.auth.admin.inviteUserByEmail(p.email, { data: { full_name: p.full_name }, redirectTo: `${env.siteUrl}/auth/callback?next=/convite` });
    if (invite.error) {
      if (!/already been registered|already registered|exists/i.test(invite.error.message)) throw invite.error;
      // usuário já existe no Auth (ex.: também é da equipe): apenas vincula
      const { data: list } = await admin.from('profiles').select('id').eq('email', p.email).maybeSingle();
      userId = (list as { id: string } | null)?.id ?? null;
      if (!userId) throw new UserError('Já existe um usuário com este e-mail. Peça que ele faça login e tente novamente.');
    } else userId = invite.data.user?.id ?? null;
    must(await admin.from('patients').update({ user_id: userId }).eq('id', p.id).eq('organization_id', ctx.org.id));
    await ctx.supabase.rpc('log_audit_event', { p_org: ctx.org.id, p_action: 'invite', p_entity: 'patients', p_entity_id: p.id, p_context: { portal: true } });
    revalidatePath(`/app/alunos/${id}`);
    return { message: 'Convite enviado para ' + p.email };
  });
}

export async function revokePortal(id: string) {
  return runAction({ permission: 'patients.edit' }, async (ctx) => {
    must(await ctx.supabase.rpc('revoke_portal_access', { p_patient_id: id }));
    revalidatePath(`/app/alunos/${id}`);
  });
}

/** Upload da foto do aluno (bucket privado "avatars"). */
export async function uploadPatientPhoto(id: string, fd: FormData) {
  return runAction({ permission: 'patients.edit' }, async (ctx) => {
    const file = fd.get('file');
    if (!(file instanceof File) || file.size === 0) throw new UserError('Selecione uma imagem.');
    if (!ALLOWED_UPLOADS.avatars.includes(file.type)) throw new UserError('Formato não suportado. Use JPG, PNG ou WEBP.');
    if (file.size > 5 * 1024 * 1024) throw new UserError('A imagem deve ter no máximo 5 MB.');
    const path = `${ctx.org.id}/patients/${id}/${safeFileName(file.name)}`;
    must(await ctx.supabase.storage.from('avatars').upload(path, file, { contentType: file.type, upsert: false }));
    must(await ctx.supabase.from('patients').update({ photo_path: path }).eq('id', id).eq('organization_id', ctx.org.id));
    revalidatePath(`/app/alunos/${id}`);
  });
}

export async function addCrmInteraction(input: { patient_id?: string; lead_id?: string; channel: string; summary: string }) {
  const schema = z.object({ patient_id: z.string().uuid().optional(), lead_id: z.string().uuid().optional(), channel: z.enum(['call', 'whatsapp', 'email', 'in_person', 'instagram', 'sms', 'other']), summary: z.string().trim().min(3, 'Descreva o contato.').max(2000) });
  return runAction({ permission: ['crm.create', 'patients.edit'], schema, input }, async (ctx, d) => {
    must(await ctx.supabase.from('crm_interactions').insert({ ...d, organization_id: ctx.org.id }));
    if (d.patient_id) await ctx.supabase.from('accounts_receivable').update({ last_contact_at: new Date().toISOString() }).eq('patient_id', d.patient_id).in('status', ['overdue', 'partial']);
    revalidatePath('/app', 'layout');
  });
}

export type PatientHit = { id: string; full_name: string; social_name: string | null; phone: string | null; status: string; replacement_balance: number };

/** Busca rápida de alunos (seletores da agenda, financeiro etc.). */
export async function searchPatients(q: string) {
  return runAction({ permission: ['patients.view', 'schedule.view'] }, async (ctx) => {
    const term = q.replace(/[%_,()]/g, ' ').trim();
    if (term.length < 2) return [] as PatientHit[];
    const digits = term.replace(/\D/g, '');
    const ors = [`full_name.ilike.%${term}%`, `social_name.ilike.%${term}%`];
    if (digits.length >= 4) ors.push(`phone.ilike.%${digits.slice(-4)}%`, `whatsapp.ilike.%${digits.slice(-4)}%`);
    const { data, error } = await ctx.supabase.from('patients').select('id, full_name, social_name, phone, status, replacement_balance')
      .eq('organization_id', ctx.org.id).is('deleted_at', null).or(ors.join(',')).order('full_name').limit(12);
    if (error) throw error;
    return (data ?? []) as PatientHit[];
  });
}

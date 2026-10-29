'use server';
import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { createAdminClient } from '@/lib/supabase/admin';
import { env } from '@/lib/env';
import { runAction, must, UserError } from './safe-action';

const hoursSchema = z.array(z.object({
  weekday: z.number().int().min(0).max(6),
  start_time: z.string().regex(/^\d{2}:\d{2}$/),
  end_time: z.string().regex(/^\d{2}:\d{2}$/),
  break_start: z.string().regex(/^\d{2}:\d{2}$/).nullable().optional(),
  break_end: z.string().regex(/^\d{2}:\d{2}$/).nullable().optional(),
  unit_id: z.string().uuid().nullable().optional(),
}).refine((h) => h.end_time > h.start_time, 'O horário final deve ser maior que o inicial.')
  .refine((h) => (!h.break_start && !h.break_end) || (!!h.break_start && !!h.break_end && h.break_end > h.break_start), 'Intervalo inválido.')).max(30);

/** Substitui a jornada semanal do profissional (dias, horários e intervalos). */
export async function saveWorkingHours(staffId: string, rows: z.input<typeof hoursSchema>) {
  return runAction({ permission: 'staff.edit', schema: hoursSchema, input: rows }, async (ctx, d) => {
    must(await ctx.supabase.from('staff_working_hours').delete().eq('staff_id', staffId).eq('organization_id', ctx.org.id));
    if (d.length) must(await ctx.supabase.from('staff_working_hours').insert(d.map((h) => ({ ...h, break_start: h.break_start || null, break_end: h.break_end || null, staff_id: staffId, organization_id: ctx.org.id }))));
    revalidatePath(`/app/equipe/${staffId}`);
  });
}

export async function saveStaffUnits(staffId: string, unitIds: string[]) {
  return runAction({ permission: 'staff.edit' }, async (ctx) => {
    const valid = unitIds.filter((u) => ctx.units.some((x) => x.id === u));
    must(await ctx.supabase.from('staff_units').delete().eq('staff_id', staffId));
    if (valid.length) must(await ctx.supabase.from('staff_units').insert(valid.map((unit_id) => ({ staff_id: staffId, unit_id }))));
    revalidatePath(`/app/equipe/${staffId}`);
  });
}

const inviteSchema = z.object({
  email: z.string().trim().toLowerCase().email('Informe um e-mail válido.'),
  full_name: z.string().trim().min(2, 'Informe o nome.'),
  role_id: z.string().uuid('Selecione o perfil de acesso.'),
  unit_ids: z.array(z.string().uuid()).default([]),
  staff_id: z.string().uuid().nullable().optional(),
});

/** Convida um usuário da equipe (cria acesso no Auth e vincula ao perfil/unidades). */
export async function inviteMember(input: z.input<typeof inviteSchema>) {
  return runAction({ permission: 'users.manage', schema: inviteSchema, input }, async (ctx, d) => {
    const { data: role } = await ctx.supabase.from('roles').select('id, key').eq('id', d.role_id).eq('organization_id', ctx.org.id).single();
    if (!role) throw new UserError('Perfil inválido.');
    if (role.key === 'owner' && ctx.org.role_key !== 'owner') throw new UserError('Somente o proprietário pode convidar outro proprietário.');
    if (role.key === 'patient') throw new UserError('Para alunos, use "Enviar acesso ao portal" na ficha do aluno.');
    const admin = createAdminClient();
    let userId: string | null = null;
    const { data: existing } = await admin.from('profiles').select('id').eq('email', d.email).maybeSingle();
    if (existing) userId = (existing as { id: string }).id;
    else {
      const inv = await admin.auth.admin.inviteUserByEmail(d.email, { data: { full_name: d.full_name }, redirectTo: `${env.siteUrl}/auth/callback?next=/convite` });
      if (inv.error) throw inv.error;
      userId = inv.data.user?.id ?? null;
    }
    if (!userId) throw new UserError('Não foi possível criar o usuário.');
    // vínculo feito com a sessão do usuário que convidou (RLS + gatilhos de proteção do proprietário)
    const { data: member, error } = await ctx.supabase.from('organization_members')
      .upsert({ organization_id: ctx.org.id, user_id: userId, role_id: d.role_id, status: 'active', all_units: d.unit_ids.length === 0, created_by: ctx.user.id }, { onConflict: 'organization_id,user_id' })
      .select('id').single();
    if (error) throw error;
    must(await ctx.supabase.from('member_units').delete().eq('member_id', member.id));
    if (d.unit_ids.length) must(await ctx.supabase.from('member_units').insert(d.unit_ids.map((unit_id) => ({ member_id: member.id, unit_id }))));
    if (d.staff_id) must(await ctx.supabase.from('staff').update({ user_id: userId }).eq('id', d.staff_id).eq('organization_id', ctx.org.id));
    await ctx.supabase.rpc('log_audit_event', { p_org: ctx.org.id, p_action: 'invite', p_entity: 'organization_members', p_entity_id: member.id, p_context: { email: d.email } });
    revalidatePath('/app/configuracoes/usuarios');
    return { message: existing ? 'Usuário existente vinculado à clínica.' : `Convite enviado para ${d.email}.` };
  });
}

export async function updateMember(memberId: string, input: { role_id: string; status: 'active' | 'suspended'; unit_ids: string[] }) {
  return runAction({ permission: 'users.manage' }, async (ctx) => {
    if (!['active', 'suspended'].includes(input.status)) throw new UserError('Status inválido.');
    must(await ctx.supabase.from('organization_members').update({ role_id: input.role_id, status: input.status, all_units: input.unit_ids.length === 0 }).eq('id', memberId).eq('organization_id', ctx.org.id));
    must(await ctx.supabase.from('member_units').delete().eq('member_id', memberId));
    const valid = input.unit_ids.filter((u) => ctx.units.some((x) => x.id === u));
    if (valid.length) must(await ctx.supabase.from('member_units').insert(valid.map((unit_id) => ({ member_id: memberId, unit_id }))));
    revalidatePath('/app/configuracoes/usuarios');
  });
}

export async function removeMember(memberId: string) {
  return runAction({ permission: 'users.manage' }, async (ctx) => {
    const { data: m } = await ctx.supabase.from('organization_members').select('user_id').eq('id', memberId).single();
    if (m?.user_id === ctx.user.id) throw new UserError('Você não pode remover o próprio acesso.');
    must(await ctx.supabase.from('organization_members').delete().eq('id', memberId).eq('organization_id', ctx.org.id));
    revalidatePath('/app/configuracoes/usuarios');
  });
}

/** Perfis de acesso: cria/edita perfil personalizado e define permissões. */
export async function saveRole(roleId: string | null, input: { name: string; description?: string; permissions: string[] }) {
  const schema = z.object({ name: z.string().trim().min(2, 'Informe o nome do perfil.').max(60), description: z.string().max(200).optional(), permissions: z.array(z.string().regex(/^[a-z_]+\.[a-z_]+$/)).max(200) });
  return runAction({ permission: 'users.manage', schema, input }, async (ctx, d) => {
    let id = roleId;
    if (id) {
      const { data: r } = await ctx.supabase.from('roles').select('key').eq('id', id).single();
      if (r?.key === 'owner') throw new UserError('O perfil Proprietário sempre tem acesso total.');
      must(await ctx.supabase.from('roles').update({ name: d.name, description: d.description ?? null }).eq('id', id).eq('organization_id', ctx.org.id));
    } else {
      const key = 'custom_' + Math.random().toString(36).slice(2, 8);
      id = (must(await ctx.supabase.from('roles').insert({ organization_id: ctx.org.id, key, name: d.name, description: d.description ?? null, is_system: false }).select('id').single()) as { id: string }).id;
    }
    const { data: current } = await ctx.supabase.from('role_permissions').select('permission_key').eq('role_id', id);
    const cur = new Set(((current ?? []) as { permission_key: string }[]).map((x) => x.permission_key));
    const next = new Set(d.permissions);
    const add = [...next].filter((p) => !cur.has(p));
    const del = [...cur].filter((p) => !next.has(p));
    if (del.length) must(await ctx.supabase.from('role_permissions').delete().eq('role_id', id).in('permission_key', del));
    if (add.length) must(await ctx.supabase.from('role_permissions').insert(add.map((permission_key) => ({ role_id: id, permission_key }))));
    revalidatePath('/app/configuracoes/perfis');
    return { id };
  });
}

export async function deleteRole(roleId: string) {
  return runAction({ permission: 'users.manage' }, async (ctx) => {
    const { count } = await ctx.supabase.from('organization_members').select('id', { count: 'exact', head: true }).eq('role_id', roleId);
    if (count) throw new UserError('Há usuários com este perfil. Altere o perfil deles antes de excluir.');
    must(await ctx.supabase.from('roles').delete().eq('id', roleId).eq('organization_id', ctx.org.id).eq('is_system', false));
    revalidatePath('/app/configuracoes/perfis');
  });
}

'use server';
import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { ORG_COOKIE, UNIT_COOKIE } from '@/lib/auth/context';
import { runAction, must } from './safe-action';

const cookieOpts = { httpOnly: true, sameSite: 'lax' as const, secure: process.env.NODE_ENV === 'production', path: '/', maxAge: 60 * 60 * 24 * 365 };

export async function switchUnit(unitId: string | 'all') {
  return runAction({}, async (ctx) => {
    if (unitId !== 'all' && !ctx.units.some((u) => u.id === unitId)) throw new Error('Unidade inválida');
    if (unitId === 'all' && !ctx.org.all_units) throw new Error('Sem acesso consolidado');
    (await cookies()).set(UNIT_COOKIE, unitId, cookieOpts);
    await ctx.supabase.from('profiles').update({ last_unit_id: unitId === 'all' ? null : unitId }).eq('id', ctx.user.id);
    revalidatePath('/app', 'layout');
  });
}

export async function switchOrg(orgId: string) {
  return runAction({ allowUnlicensed: true }, async (ctx) => {
    if (!ctx.orgs.some((o) => o.id === orgId)) throw new Error('Organização inválida');
    const store = await cookies();
    store.set(ORG_COOKIE, orgId, cookieOpts);
    store.delete(UNIT_COOKIE);
    await ctx.supabase.from('profiles').update({ last_organization_id: orgId }).eq('id', ctx.user.id);
    revalidatePath('/app', 'layout');
    revalidatePath('/licenca');
  });
}

export type SearchHit = { type: string; id: string; title: string; subtitle?: string; href: string };
export async function globalSearch(q: string) {
  return runAction({}, async (ctx) => {
    if (q.trim().length < 2) return [] as SearchHit[];
    return (must(await ctx.supabase.rpc('search_global', { p_org: ctx.org.id, p_q: q.slice(0, 80) })) ?? []) as SearchHit[];
  });
}

export type NotificationItem = { id: string; type: string; title: string; body: string | null; link: string | null; read_at: string | null; created_at: string };
export async function listNotifications(limit = 20) {
  return runAction({}, async (ctx) => {
    const { data, error } = await ctx.supabase.from('notifications').select('id, type, title, body, link, read_at, created_at')
      .eq('organization_id', ctx.org.id).order('created_at', { ascending: false }).limit(limit);
    if (error) throw error;
    const { count } = await ctx.supabase.from('notifications').select('id', { count: 'exact', head: true }).eq('organization_id', ctx.org.id).is('read_at', null);
    return { items: (data ?? []) as NotificationItem[], unread: count ?? 0 };
  });
}

export async function markNotificationsRead(ids?: string[]) {
  return runAction({}, async (ctx) => {
    must(await ctx.supabase.rpc('mark_notifications_read', { p_ids: ids ?? null }));
  });
}

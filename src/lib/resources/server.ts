import 'server-only';
import type { AppContext } from '@/lib/auth/context';
import { getResourceDef } from './defs';
import type { Option, ResourceDef } from './types';

export type ListParams = { q?: string; page?: number; filters?: Record<string, string | null | undefined>; parent?: Record<string, string>; pageSize?: number };

function escapeLike(v: string) {
  return v.replace(/[%_,()]/g, ' ').trim();
}

/** Lista registros de um cadastro com busca, filtros, paginação e escopo de unidade. */
export async function listResource(ctx: AppContext, key: string, params: ListParams = {}) {
  const def = getResourceDef(key);
  const size = params.pageSize ?? def.pageSize ?? 25;
  const page = Math.max(1, params.page ?? 1);
  const multi = def.fields.filter((f) => f.type === 'multiref');
  const select = ['*', ...multi.map((f) => `${f.join!.table}(${f.join!.refFk})`)].join(',');
  let q = ctx.supabase.from(def.table).select(select, { count: 'exact' }).eq('organization_id', ctx.org.id);
  if (def.softDelete) q = q.is('deleted_at', null);
  if (def.unitField && ctx.unitId) q = q.or(`${def.unitField}.eq.${ctx.unitId},${def.unitField}.is.null`);
  for (const [k, v] of Object.entries(def.listFilter ?? {})) q = v === null ? q.is(k, null) : q.eq(k, v as string);
  for (const [k, v] of Object.entries(params.parent ?? {})) q = q.eq(k, v);
  for (const [k, v] of Object.entries(params.filters ?? {})) if (v) q = q.eq(k, v);
  const term = escapeLike(params.q ?? '');
  if (term && def.searchFields?.length) q = q.or(def.searchFields.map((f) => `${f}.ilike.%${term}%`).join(','));
  for (const o of def.orderBy ?? [{ column: 'created_at', ascending: false }]) q = q.order(o.column, { ascending: o.ascending ?? true, nullsFirst: false });
  q = q.range((page - 1) * size, page * size - 1);
  const { data, error, count } = await q;
  if (error) throw error;
  const rows = ((data ?? []) as unknown as Record<string, unknown>[]).map((r) => {
    for (const f of multi) {
      const arr = (r[f.join!.table] as Record<string, string>[] | undefined) ?? [];
      r[f.name] = arr.map((x) => x[f.join!.refFk]);
      delete r[f.join!.table];
    }
    return r;
  });
  return { rows, total: count ?? 0, page, pageSize: size };
}

/** Carrega opções dos campos de referência (selects) da organização. */
export async function loadRefOptions(ctx: AppContext, def: ResourceDef) {
  const out: Record<string, Option[]> = {};
  await Promise.all(def.fields.filter((f) => (f.type === 'ref' || f.type === 'multiref') && f.ref).map(async (f) => {
    out[f.name] = await refOptions(ctx, f.ref!.table, f.ref!.label, f.ref!.where, f.ref!.orderBy, f.ref!.special);
  }));
  return out;
}

export async function refOptions(ctx: AppContext, table: string, label: string, where?: Record<string, unknown>, orderBy?: string, special?: 'members'): Promise<Option[]> {
  if (special === 'members') {
    const { data } = await ctx.supabase.from('organization_members').select('user_id, profiles:profiles!inner(full_name, email)')
      .eq('organization_id', ctx.org.id).eq('status', 'active');
    return ((data ?? []) as unknown as { user_id: string; profiles: { full_name: string | null; email: string | null } }[])
      .map((m) => ({ value: m.user_id, label: m.profiles?.full_name || m.profiles?.email || 'Usuário' }))
      .sort((a, b) => a.label.localeCompare(b.label, 'pt-BR'));
  }
  let q = ctx.supabase.from(table).select(`id, ${label}`).eq('organization_id', ctx.org.id).order(orderBy ?? label).limit(1000);
  const hasDeleted = ['patients', 'staff', 'units', 'rooms', 'services', 'equipment', 'suppliers', 'plans', 'exercises', 'contract_templates', 'leads', 'inventory_products'];
  if (hasDeleted.includes(table)) q = q.is('deleted_at', null);
  for (const [k, v] of Object.entries(where ?? {})) q = v === null ? q.is(k, null) : q.eq(k, v as string);
  const { data } = await q;
  return ((data ?? []) as unknown as Record<string, string>[]).map((r) => ({ value: r.id, label: r[label] ?? '—' }));
}

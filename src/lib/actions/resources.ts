'use server';
import { revalidatePath } from 'next/cache';
import { getResourceDef } from '@/lib/resources/defs';
import { buildSchema } from '@/lib/resources/schema';
import { localToISO } from '@/lib/format';
import { runAction, UserError, must } from './safe-action';
import type { AppContext } from '@/lib/auth/context';

function anyPerm(ctx: AppContext, p: string | string[]) {
  return (Array.isArray(p) ? p : [p]).some((x) => ctx.can(x));
}

/** Cria ou atualiza um registro de um cadastro declarativo. O organization_id vem sempre da sessão. */
export async function saveResource(key: string, id: string | null, values: Record<string, unknown>, fixed?: Record<string, string>) {
  const def = getResourceDef(key);
  return runAction({ permission: id ? def.perms.edit : def.perms.create }, async (ctx) => {
    const schema = buildSchema(def, id ? 'edit' : 'create');
    const input = { ...values, ...(def.parentField && fixed?.[def.parentField] ? { [def.parentField]: fixed[def.parentField] } : {}) };
    const parsed = schema.safeParse(input);
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      throw new UserError(first?.message ?? 'Dados inválidos.');
    }
    const data: Record<string, unknown> = { ...parsed.data };
    const joins: { field: string; ids: string[] }[] = [];
    for (const f of def.fields) {
      if (!(f.name in data)) continue;
      if (f.type === 'datetime' && typeof data[f.name] === 'string') data[f.name] = localToISO(String(data[f.name]).slice(0, 10), String(data[f.name]).slice(11, 16), ctx.tz);
      if (f.type === 'multiref') { joins.push({ field: f.name, ids: (data[f.name] as string[]) ?? [] }); delete data[f.name]; }
    }
    if (!id) {
      data.organization_id = ctx.org.id;
      if (def.unitField && !data[def.unitField] && ctx.unitId) data[def.unitField] = ctx.unitId;
      if (def.unitField && !data[def.unitField] && ctx.units.length === 1) data[def.unitField] = ctx.units[0].id;
      Object.assign(data, def.insertDefaults ?? {});
    }
    let rowId = id;
    if (id) {
      const { error } = await ctx.supabase.from(def.table).update(data).eq('id', id).eq('organization_id', ctx.org.id);
      if (error) throw error;
    } else {
      const row = must(await ctx.supabase.from(def.table).insert(data).select('id').single()) as { id: string };
      rowId = row.id;
    }
    for (const j of joins) {
      const f = def.fields.find((x) => x.name === j.field)!;
      const join = f.join!;
      must(await ctx.supabase.from(join.table).delete().eq(join.fk, rowId!));
      if (j.ids.length) must(await ctx.supabase.from(join.table).insert(j.ids.map((rid) => ({ [join.fk]: rowId, [join.refFk]: rid }))));
    }
    revalidatePath('/app', 'layout');
    return { id: rowId };
  });
}

/** Exclui (ou arquiva, quando há deleted_at) um registro. */
export async function deleteResource(key: string, id: string) {
  const def = getResourceDef(key);
  if (def.noDelete || !def.perms.delete) return { ok: false as const, error: 'Este registro não pode ser excluído.' };
  return runAction({ permission: def.perms.delete }, async (ctx) => {
    if (def.softDelete) {
      must(await ctx.supabase.from(def.table).update({ deleted_at: new Date().toISOString() }).eq('id', id).eq('organization_id', ctx.org.id));
    } else {
      const { error } = await ctx.supabase.from(def.table).delete().eq('id', id).eq('organization_id', ctx.org.id);
      if (error) throw error;
    }
    revalidatePath('/app', 'layout');
  });
}

export async function canView(ctx: AppContext, key: string) {
  return anyPerm(ctx, getResourceDef(key).perms.view);
}

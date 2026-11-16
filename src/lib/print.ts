import 'server-only';
import type { AppContext } from '@/lib/auth/context';
import { env } from '@/lib/env';
import { storagePublicUrl } from '@/lib/utils';

export type PrintOrg = { name: string; legal_name: string | null; cnpj: string | null; phone: string | null; email: string | null; logo: string | null; address: string | null };

/** Cabeçalho institucional para documentos impressos. */
export async function loadPrintOrg(ctx: AppContext, unitId?: string | null): Promise<PrintOrg> {
  const [{ data: o }, { data: u }] = await Promise.all([
    ctx.supabase.from('organizations').select('name, legal_name, cnpj, phone, email, logo_path').eq('id', ctx.org.id).single(),
    ctx.supabase.from('units').select('name, cnpj, phone, address_street, address_number, address_district, address_city, address_state, address_zip')
      .eq('organization_id', ctx.org.id).eq('id', unitId ?? ctx.unitId ?? ctx.units[0]?.id ?? '00000000-0000-0000-0000-000000000000').maybeSingle(),
  ]);
  const addr = u ? [u.address_street, u.address_number, u.address_district, u.address_city && `${u.address_city}/${u.address_state ?? ''}`, u.address_zip].filter(Boolean).join(', ') : null;
  return {
    name: o?.name ?? ctx.org.name, legal_name: o?.legal_name ?? null, cnpj: u?.cnpj ?? o?.cnpj ?? null, phone: u?.phone ?? o?.phone ?? null,
    email: o?.email ?? null, logo: storagePublicUrl(env.supabaseUrl, 'site', o?.logo_path), address: addr || null,
  };
}

/** Registra a impressão na auditoria (documentos com dados de saúde). */
export async function auditPrint(ctx: AppContext, entity: string, entityId: string, context: Record<string, unknown> = {}) {
  await ctx.supabase.rpc('log_audit_event', { p_org: ctx.org.id, p_action: 'print', p_entity: entity, p_entity_id: entityId, p_context: context });
}

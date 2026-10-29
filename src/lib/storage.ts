import 'server-only';
import type { AppContext } from '@/lib/auth/context';

/** URL temporária (assinada) para arquivo privado. O Storage aplica as policies do usuário. */
export async function signedUrl(ctx: AppContext, bucket: string, path: string | null | undefined, expiresIn = 300, opts?: { audit?: boolean; entity?: string; entityId?: string; download?: boolean }) {
  if (!path) return null;
  if (!path.startsWith(ctx.org.id + '/')) return null;
  const { data, error } = await ctx.supabase.storage.from(bucket).createSignedUrl(path, expiresIn, opts?.download ? { download: true } : undefined);
  if (error || !data) return null;
  if (opts?.audit) {
    await ctx.supabase.rpc('log_audit_event', { p_org: ctx.org.id, p_action: 'download', p_entity: opts.entity ?? bucket, p_entity_id: opts.entityId ?? path, p_context: { bucket, path } });
  }
  return data.signedUrl;
}

export async function signedUrls(ctx: AppContext, bucket: string, paths: (string | null | undefined)[], expiresIn = 300) {
  const valid = paths.filter((p): p is string => !!p && p.startsWith(ctx.org.id + '/'));
  if (!valid.length) return {} as Record<string, string>;
  const { data } = await ctx.supabase.storage.from(bucket).createSignedUrls(valid, expiresIn);
  const out: Record<string, string> = {};
  for (const d of data ?? []) if (d.signedUrl && d.path) out[d.path] = d.signedUrl;
  return out;
}

export const ALLOWED_UPLOADS: Record<string, string[]> = {
  clinical: ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'],
  documents: ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'],
  avatars: ['image/jpeg', 'image/png', 'image/webp'],
  site: ['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml'],
};

export function safeFileName(name: string) {
  const ext = (name.split('.').pop() ?? 'bin').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 5);
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
}

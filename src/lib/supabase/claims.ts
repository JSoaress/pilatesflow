import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Usuário da sessão verificando o token (JWT) localmente quando o projeto usa chaves de
 * assinatura assimétricas (padrão nos projetos novos do Supabase) — evita uma chamada de rede
 * ao servidor de autenticação a cada página. Se não for possível, cai para getUser().
 */
export async function sessionUser(supabase: SupabaseClient<any, any, any>): Promise<{ id: string; email: string | null } | null> {
  const auth = supabase.auth as unknown as { getClaims?: () => Promise<{ data: { claims: Record<string, unknown> } | null; error: unknown }> };
  if (typeof auth.getClaims === 'function') {
    try {
      const { data, error } = await auth.getClaims();
      const c = data?.claims;
      if (!error && c && typeof c.sub === 'string') return { id: c.sub, email: typeof c.email === 'string' ? c.email : null };
      if (!error) return null;
    } catch { /* fallback abaixo */ }
  }
  const { data } = await supabase.auth.getUser();
  return data.user ? { id: data.user.id, email: data.user.email ?? null } : null;
}

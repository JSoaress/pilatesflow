'use client';
import { createBrowserClient } from '@supabase/ssr';
import { env } from '@/lib/env';

let client: ReturnType<typeof createBrowserClient> | null = null;

/** Cliente Supabase no navegador (somente com a chave pública + sessão; RLS se aplica). */
export function createClient() {
  if (!client) client = createBrowserClient(env.supabaseUrl, env.supabaseAnonKey);
  return client;
}

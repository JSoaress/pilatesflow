import 'server-only';
import { createClient } from '@supabase/supabase-js';
import { env, serverEnv } from '@/lib/env';
import type { DB } from './server';

/**
 * Cliente com SERVICE ROLE — ignora RLS. Usar SOMENTE no servidor, depois de
 * verificar permissões do usuário, ou em rotinas (cron, webhooks, convites).
 */
export function createAdminClient(): DB {
  const key = serverEnv().serviceRoleKey;
  if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY não configurada.');
  return createClient(env.supabaseUrl, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  }) as unknown as DB;
}

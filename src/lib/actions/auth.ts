'use server';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { env, serverEnv } from '@/lib/env';
import { friendlyError } from '@/lib/errors';
import { password } from '@/lib/validation/common';
import { captureException } from '@/lib/observability';

type Res = { ok: boolean; error?: string; message?: string };

async function clientIp() {
  const h = await headers();
  return (h.get('x-forwarded-for') ?? h.get('x-real-ip') ?? 'local').split(',')[0].trim();
}

/** Rate limit no banco (proteção contra força bruta). Sem service role, confia no limite do Supabase Auth. */
async function allow(key: string, max: number, windowSeconds: number) {
  if (!serverEnv().serviceRoleKey) return true;
  try {
    const admin = createAdminClient();
    const { data } = await admin.rpc('check_rate_limit', { p_key: key, p_max: max, p_window_seconds: windowSeconds });
    return data !== false;
  } catch (e) {
    captureException(e, { where: 'rate-limit' });
    return true;
  }
}

const loginSchema = z.object({ email: z.string().trim().toLowerCase().email('Informe um e-mail válido.'), password: z.string().min(1, 'Informe a senha.') });

export async function loginAction(input: { email: string; password: string; next?: string }): Promise<Res> {
  const parsed = loginSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const ip = await clientIp();
  if (!(await allow(`login:ip:${ip}`, 20, 900)) || !(await allow(`login:email:${parsed.data.email}`, 8, 900))) {
    return { ok: false, error: 'Muitas tentativas de login. Aguarde 15 minutos e tente novamente.' };
  }
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) return { ok: false, error: friendlyError(error) };
  const next = input.next && input.next.startsWith('/') && !input.next.startsWith('//') ? input.next : '/entrar';
  redirect(next);
}

const signupSchema = z.object({
  full_name: z.string().trim().min(3, 'Informe seu nome completo.'),
  email: z.string().trim().toLowerCase().email('Informe um e-mail válido.'),
  password,
  accept: z.literal(true, { error: 'É preciso aceitar os Termos de Uso e a Política de Privacidade.' }),
});

export async function signupAction(input: unknown): Promise<Res> {
  if (!serverEnv().allowSignup) return { ok: false, error: 'O cadastro público está desativado. Solicite um convite ao administrador.' };
  const parsed = signupSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const ip = await clientIp();
  if (!(await allow(`signup:ip:${ip}`, 5, 3600))) return { ok: false, error: 'Muitas tentativas. Tente novamente mais tarde.' };
  const supabase = await createClient();
  const { error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: { data: { full_name: parsed.data.full_name }, emailRedirectTo: `${env.siteUrl}/auth/callback?next=/onboarding` },
  });
  if (error) return { ok: false, error: friendlyError(error) };
  return { ok: true, message: 'Enviamos um link de confirmação para o seu e-mail. Confirme para entrar.' };
}

export async function forgotPasswordAction(input: { email: string }): Promise<Res> {
  const email = z.string().trim().toLowerCase().email().safeParse(input.email);
  if (!email.success) return { ok: false, error: 'Informe um e-mail válido.' };
  const ip = await clientIp();
  if (!(await allow(`forgot:${ip}`, 5, 3600))) return { ok: false, error: 'Muitas tentativas. Tente novamente mais tarde.' };
  const supabase = await createClient();
  await supabase.auth.resetPasswordForEmail(email.data, { redirectTo: `${env.siteUrl}/auth/callback?next=/redefinir-senha` });
  // resposta sempre igual, para não revelar se o e-mail existe
  return { ok: true, message: 'Se o e-mail estiver cadastrado, você receberá um link para redefinir a senha.' };
}

export async function resetPasswordAction(input: { password: string; confirm: string }): Promise<Res> {
  const p = password.safeParse(input.password);
  if (!p.success) return { ok: false, error: p.error.issues[0].message };
  if (input.password !== input.confirm) return { ok: false, error: 'As senhas não conferem.' };
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return { ok: false, error: 'O link expirou. Solicite uma nova redefinição de senha.' };
  const { error } = await supabase.auth.updateUser({ password: input.password });
  if (error) return { ok: false, error: friendlyError(error) };
  // encerra outras sessões após troca de senha
  await supabase.auth.signOut({ scope: 'others' });
  return { ok: true, message: 'Senha alterada com sucesso.' };
}

export async function logoutAction(scope: 'local' | 'global' = 'local') {
  const supabase = await createClient();
  await supabase.auth.signOut({ scope });
  redirect('/login');
}

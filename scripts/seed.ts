// Seed de demonstração: cria usuários fictícios no Supabase Auth e popula a clínica
// "Studio Movimento Pilates" usando as próprias regras do banco (RPCs).
// Uso: npm run seed   (requer NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no .env.local)
import { config } from 'dotenv';
import { createClient } from '@supabase/supabase-js';

config({ path: '.env.docker' });
config();

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const password = process.env.DEMO_PASSWORD || 'Demo@12345';
if (!url || !key) { console.error('Defina NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no .env.local'); process.exit(1); }
const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

const USERS = [
  ['owner', 'dono@demo.pilatesflow.app', 'Ana Proprietária'],
  ['physio', 'mariana@demo.pilatesflow.app', 'Mariana Souza'],
  ['instructor', 'carlos@demo.pilatesflow.app', 'Carlos Lima'],
  ['reception', 'recepcao@demo.pilatesflow.app', 'Júlia Recepção'],
  ['patient', 'aluno@demo.pilatesflow.app', 'Aluno Demonstração'],
] as const;

async function ensureUser(email: string, name: string) {
  const { data: list } = await admin.auth.admin.listUsers({ perPage: 1000 });
  const found = list?.users.find((u) => u.email === email);
  if (found) return found.id;
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name: name } });
  if (error) throw error;
  return data.user.id;
}

async function main() {
  const ids: Record<string, string> = {};
  for (const [k, email, name] of USERS) ids[k] = await ensureUser(email, name);
  const { data, error } = await admin.rpc('seed_demo_data', { p_owner: ids.owner, p_physio: ids.physio, p_instructor: ids.instructor, p_reception: ids.reception, p_patient_user: ids.patient });
  if (error) { console.error('Erro no seed:', error.message); process.exit(1); }
  console.log('\n✔ Dados de demonstração criados. Organização:', data);
  console.log(`\nLogins (senha: ${password}):`);
  for (const [k, email] of USERS) console.log(`  ${k.padEnd(11)} ${email}`);
  console.log('\nAbra http://localhost:3000/entrar\n');
}
main().catch((e) => { console.error(e); process.exit(1); });

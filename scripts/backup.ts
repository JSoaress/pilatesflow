// Backup externo: dump do banco (pg_dump) + cópia dos arquivos dos buckets privados.
// Registra cada execução real em public.backup_runs (aparece em Configurações › Backup).
// Uso: npm run backup
// Requer no .env.local: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY e, para o banco,
//   SUPABASE_DB_URL (Settings › Database › Connection string › URI) + pg_dump instalado.
import { config } from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync, statSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';

config({ path: '.env.local' });
config();
const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
if (!url || !key) { console.error('Defina NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY.'); process.exit(1); }
const sb = createClient(url, key, { auth: { persistSession: false } });
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const dir = join(process.env.BACKUP_DIR || 'backups', stamp);
mkdirSync(dir, { recursive: true });

async function record(kind: 'database' | 'storage', fn: () => Promise<{ size: number; location: string; checksum?: string }>) {
  const { data: run } = await sb.from('backup_runs').insert({ kind, source: 'script', status: 'running' }).select('id').single();
  try {
    const r = await fn();
    await sb.from('backup_runs').update({ status: 'success', finished_at: new Date().toISOString(), size_bytes: r.size, location: r.location, checksum: r.checksum ?? null }).eq('id', run!.id);
    console.log(`✔ ${kind}: ${(r.size / 1048576).toFixed(1)} MB em ${r.location}`);
  } catch (e) {
    await sb.from('backup_runs').update({ status: 'failed', finished_at: new Date().toISOString(), error: String((e as Error).message).slice(0, 500) }).eq('id', run!.id);
    console.error(`✖ ${kind}:`, (e as Error).message);
  }
}

async function main() {
  if (process.env.SUPABASE_DB_URL) {
    await record('database', async () => {
      const file = join(dir, 'database.dump');
      execFileSync('pg_dump', ['--format=custom', '--no-owner', '--no-privileges', '--file', file, process.env.SUPABASE_DB_URL!], { stdio: 'inherit' });
      return { size: statSync(file).size, location: file };
    });
  } else console.warn('SUPABASE_DB_URL não definido: dump do banco ignorado (o Supabase mantém backups diários no plano Pro).');

  await record('storage', async () => {
    let total = 0; const hash = createHash('sha256');
    for (const bucket of ['clinical', 'documents', 'avatars', 'site']) {
      const walk = async (prefix: string): Promise<void> => {
        for (let offset = 0; ; offset += 1000) {
          const { data, error } = await sb.storage.from(bucket).list(prefix, { limit: 1000, offset });
          if (error) throw error;
          if (!data?.length) break;
          for (const it of data) {
            const path = prefix ? `${prefix}/${it.name}` : it.name;
            if (!it.id) { await walk(path); continue; }
            const { data: blob, error: e2 } = await sb.storage.from(bucket).download(path);
            if (e2) throw e2;
            const buf = Buffer.from(await blob.arrayBuffer());
            const out = join(dir, 'storage', bucket, path);
            mkdirSync(join(out, '..'), { recursive: true });
            writeFileSync(out, buf);
            total += buf.length; hash.update(path).update(buf);
          }
          if (data.length < 1000) break;
        }
      };
      await walk('');
    }
    return { size: total, location: join(dir, 'storage'), checksum: hash.digest('hex') };
  });
  console.log(`\nBackup salvo em ${dir} (${readdirSync(dir).join(', ')}). Guarde uma cópia fora deste computador e proteja-a: contém dados de saúde.`);
}
main().catch((e) => { console.error(e); process.exit(1); });

import { requirePermission } from '@/lib/auth/context';
import { PageHeader, Section, Table, Th, Td, Tr, EmptyState } from '@/components/ui/misc';
import { Badge } from '@/components/ui/badge';
import { SettingsForm } from '@/components/app/settings-form';
import { dateTime } from '@/lib/format';

export const metadata = { title: 'Backup' };

export default async function BackupPage() {
  const ctx = await requirePermission('settings.view');
  const [{ data: runs }, { data: pol }] = await Promise.all([
    ctx.supabase.from('backup_runs').select('*').order('started_at', { ascending: false }).limit(30),
    ctx.supabase.from('system_settings').select('value').eq('organization_id', ctx.org.id).eq('key', 'backup_policy').maybeSingle(),
  ]);
  const list = (runs ?? []) as any[];
  const lastOk = list.find((r) => r.status === 'success');
  const days = lastOk ? Math.floor((Date.now() - Date.parse(lastOk.finished_at ?? lastOk.started_at)) / 86400000) : null;
  return (
    <>
      <PageHeader title="Backup" description="Esta tela mostra apenas execuções reais registradas pelo script de backup. Nada aqui é simulado." />
      <div className="grid gap-6 xl:grid-cols-2">
        <Section title="Situação">
          {lastOk ? (
            <p className="text-sm">Último backup bem-sucedido: <strong>{dateTime(lastOk.finished_at ?? lastOk.started_at, ctx.tz)}</strong> ({days === 0 ? 'hoje' : `há ${days} dia(s)`}).{days !== null && days > 7 && <Badge variant="warning" className="ml-2">Atrasado</Badge>}</p>
          ) : <p className="text-sm text-warning">Nenhum backup registrado por script ainda. O Supabase faz backups diários do banco nos planos pagos (Pro ou superior); confira em Database → Backups no painel.</p>}
          <div className="mt-4 space-y-2 text-sm text-muted-foreground">
            <p><strong className="text-foreground">Banco de dados:</strong> no plano Pro do Supabase há backup diário automático (7 dias) e opção de restauração para um ponto no tempo.</p>
            <p><strong className="text-foreground">Cópia extra (recomendado):</strong> rode periodicamente <code>npm run backup</code> — gera um dump do banco e copia os arquivos dos buckets privados para um local seu, registrando a execução aqui.</p>
            <p><strong className="text-foreground">Restauração:</strong> pelo painel do Supabase (Database → Backups) ou com <code>psql</code> a partir do dump. Teste a restauração em um projeto separado a cada 3 meses.</p>
          </div>
        </Section>
        <Section title="Política de backup">
          <SettingsForm settingKey="backup_policy" initial={(pol?.value as any) ?? {}} fields={[
            { name: 'database', label: 'Banco de dados', type: 'textarea' },
            { name: 'storage', label: 'Arquivos', type: 'textarea' },
            { name: 'retention_days', label: 'Retenção (dias)', type: 'int' },
          ]} />
        </Section>
      </div>
      <Section title="Execuções registradas" className="mt-6">
        {list.length === 0 ? <EmptyState title="Nenhuma execução registrada" /> : (
          <Table>
            <thead><tr><Th>Início</Th><Th>Tipo</Th><Th>Origem</Th><Th>Status</Th><Th>Tamanho</Th><Th>Local</Th></tr></thead>
            <tbody>{list.map((r) => (
              <Tr key={r.id}>
                <Td>{dateTime(r.started_at, ctx.tz)}</Td><Td>{({ database: 'Banco', storage: 'Arquivos', full: 'Completo' } as Record<string, string>)[r.kind]}</Td>
                <Td>{({ supabase_managed: 'Supabase', script: 'Script', external: 'Externo' } as Record<string, string>)[r.source]}</Td>
                <Td><Badge variant={r.status === 'success' ? 'success' : r.status === 'failed' ? 'danger' : 'warning'}>{({ success: 'Sucesso', failed: 'Falhou', running: 'Em andamento' } as Record<string, string>)[r.status]}</Badge>{r.error && <p className="text-xs text-destructive">{r.error}</p>}</Td>
                <Td>{r.size_bytes ? `${(r.size_bytes / 1048576).toFixed(1)} MB` : '—'}</Td><Td className="max-w-[260px] truncate text-xs">{r.location ?? '—'}</Td>
              </Tr>
            ))}</tbody>
          </Table>
        )}
      </Section>
    </>
  );
}

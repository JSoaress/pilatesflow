import { requirePermission } from '@/lib/auth/context';
import { PageHeader, Table, Th, Td, Tr, EmptyState } from '@/components/ui/misc';
import { FilterSelect, Pagination, SearchBox } from '@/components/app/list-controls';
import { dateTime } from '@/lib/format';
import { auditAction, entityLabel, label } from '@/lib/labels';

export const metadata = { title: 'Auditoria' };
const PAGE = 50;

export default async function AuditPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const ctx = await requirePermission('audit.view');
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.p) || 1);
  let q = ctx.supabase.from('audit_logs').select('id, created_at, user_email, action, entity, entity_id, changed_fields, ip, context', { count: 'exact' }).eq('organization_id', ctx.org.id);
  if (sp.acao) q = q.eq('action', sp.acao);
  if (sp.entidade) q = q.eq('entity', sp.entidade);
  if (sp.q) q = q.ilike('user_email', `%${sp.q.replace(/[%_]/g, '')}%`);
  if (/^\d{4}-\d{2}-\d{2}$/.test(sp.de ?? '')) q = q.gte('created_at', sp.de);
  const { data, count, error } = await q.order('created_at', { ascending: false }).range((page - 1) * PAGE, page * PAGE - 1);
  const rows = (data ?? []) as any[];
  return (
    <>
      <PageHeader title="Auditoria" description="Registro imutável: ninguém (nem o proprietário) consegue alterar ou apagar estes registros." />
      <div className="mb-4 flex flex-wrap gap-2">
        <SearchBox placeholder="Filtrar por e-mail do usuário…" />
        <FilterSelect param="acao" label="Ação" options={Object.entries(auditAction).map(([value, l]) => ({ value, label: l }))} allLabel="Todas as ações" />
        <FilterSelect param="entidade" label="Registro" options={Object.entries(entityLabel).map(([value, l]) => ({ value, label: l }))} allLabel="Todos os registros" />
      </div>
      {error ? <EmptyState title="Não foi possível carregar" /> : rows.length === 0 ? <EmptyState title="Nenhum registro" /> : (
        <div className="overflow-x-auto rounded-xl border bg-card">
          <Table>
            <thead><tr><Th>Data</Th><Th>Usuário</Th><Th>Ação</Th><Th>Registro</Th><Th>Detalhes</Th><Th>IP</Th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <Tr key={r.id}>
                  <Td className="whitespace-nowrap tabular-nums">{dateTime(r.created_at, ctx.tz)}</Td>
                  <Td>{r.user_email ?? 'sistema'}</Td>
                  <Td>{label(auditAction, r.action)}</Td>
                  <Td>{label(entityLabel, r.entity)}{r.entity_id ? <span className="ml-1 font-mono text-[11px] text-muted-foreground">{String(r.entity_id).slice(0, 8)}</span> : null}</Td>
                  <Td className="max-w-[320px] text-xs text-muted-foreground">{r.changed_fields?.length ? `Campos: ${r.changed_fields.join(', ')}` : r.context ? JSON.stringify(r.context).slice(0, 160) : ''}</Td>
                  <Td className="text-xs text-muted-foreground">{r.ip ?? ''}</Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        </div>
      )}
      <Pagination page={page} total={count ?? 0} pageSize={PAGE} />
    </>
  );
}

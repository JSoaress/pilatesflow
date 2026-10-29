import Link from 'next/link';
import { FileHeart } from 'lucide-react';
import { requirePermission } from '@/lib/auth/context';
import { PageHeader, Table, Th, Td, Tr, EmptyState } from '@/components/ui/misc';
import { SearchBox, Pagination } from '@/components/app/list-controls';
import { dateTime } from '@/lib/format';

export const metadata = { title: 'Prontuários' };

export default async function RecordsPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const ctx = await requirePermission('medical_records.view');
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.p ?? 1) || 1);
  const term = (sp.q ?? '').replace(/[%_,()]/g, ' ').trim();
  let q = ctx.supabase.from('patients').select('id, full_name, social_name, status, medical_records(updated_at), clinical_evolutions(occurred_at)', { count: 'exact' })
    .eq('organization_id', ctx.org.id).is('deleted_at', null).in('status', ['active', 'trial', 'paused']);
  if (ctx.unitId) q = q.eq('unit_id', ctx.unitId);
  if (term) q = q.ilike('full_name', `%${term}%`);
  const { data, count } = await q.order('full_name').range((page - 1) * 30, page * 30 - 1);
  const rows = (data ?? []) as any[];
  return (
    <>
      <PageHeader title="Prontuários" description="Acesso restrito. Toda consulta e alteração de dados clínicos é registrada." />
      <div className="mb-4"><SearchBox placeholder="Buscar aluno" /></div>
      {rows.length === 0 ? <EmptyState icon={FileHeart} title="Nenhum aluno encontrado" /> : (
        <>
          <Table>
            <thead><tr><Th>Aluno</Th><Th>Prontuário</Th><Th>Última evolução</Th><Th>Evoluções</Th></tr></thead>
            <tbody>
              {rows.map((p) => {
                const evs = (p.clinical_evolutions ?? []).map((e: any) => e.occurred_at).sort();
                const mr = (p.medical_records ?? [])[0] ?? (p.medical_records && !Array.isArray(p.medical_records) ? p.medical_records : null);
                return (
                  <Tr key={p.id}>
                    <Td><Link href={`/app/alunos/${p.id}?aba=prontuario`} className="font-medium text-primary hover:underline">{p.social_name || p.full_name}</Link></Td>
                    <Td>{mr ? `Atualizado ${dateTime(mr.updated_at, ctx.tz)}` : <span className="text-muted-foreground">Não preenchido</span>}</Td>
                    <Td>{evs.length ? dateTime(evs[evs.length - 1], ctx.tz) : '—'}</Td>
                    <Td className="tabular-nums">{evs.length}</Td>
                  </Tr>
                );
              })}
            </tbody>
          </Table>
          <div className="mt-3"><Pagination page={page} total={count ?? 0} pageSize={30} /></div>
        </>
      )}
    </>
  );
}

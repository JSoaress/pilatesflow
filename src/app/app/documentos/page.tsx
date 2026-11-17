import Link from 'next/link';
import { FileText, Printer } from 'lucide-react';
import { requirePermission } from '@/lib/auth/context';
import { PageHeader, Table, Th, Td, Tr, EmptyState } from '@/components/ui/misc';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { FilterSelect, Pagination, SearchBox } from '@/components/app/list-controls';
import { date } from '@/lib/format';
import { documentType, documentStatus, label } from '@/lib/labels';

export const metadata = { title: 'Documentos' };
const PAGE = 40;

export default async function DocumentsPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const ctx = await requirePermission('documents.view');
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.p) || 1);
  let q = ctx.supabase.from('documents').select('id, title, type, status, created_at, signed_at, is_clinical, requires_signature, patient:patients(id, full_name)', { count: 'exact' }).eq('organization_id', ctx.org.id).is('deleted_at', null);
  if (ctx.unitId) q = q.or(`unit_id.eq.${ctx.unitId},unit_id.is.null`);
  if (sp.tipo) q = q.eq('type', sp.tipo);
  if (sp.status) q = q.eq('status', sp.status);
  if (sp.q) q = q.ilike('title', `%${sp.q.replace(/[%_,()]/g, ' ')}%`);
  const { data, count, error } = await q.order('created_at', { ascending: false }).range((page - 1) * PAGE, page * PAGE - 1);
  const rows = (data ?? []) as any[];
  return (
    <>
      <PageHeader title="Documentos" description="Contratos, termos, atestados e folhas entregues aos alunos. Gere novos documentos pela ficha do aluno (aba Documentos ou botão Imprimir)."
        actions={<Link href="/app/configuracoes/modelos"><Button variant="outline"><FileText />Modelos</Button></Link>} />
      <div className="mb-4 flex flex-wrap gap-2">
        <SearchBox placeholder="Buscar por título…" />
        <FilterSelect param="tipo" label="Tipo" options={Object.entries(documentType).map(([value, l]) => ({ value, label: l }))} />
        <FilterSelect param="status" label="Status" options={Object.entries(documentStatus).map(([value, l]) => ({ value, label: l }))} />
      </div>
      {error ? <EmptyState title="Não foi possível carregar" /> : rows.length === 0 ? <EmptyState icon={FileText} title="Nenhum documento" description="Os documentos gerados para os alunos aparecem aqui." /> : (
        <div className="overflow-x-auto rounded-xl border bg-card">
          <Table>
            <thead><tr><Th>Documento</Th><Th>Aluno</Th><Th>Tipo</Th><Th>Status</Th><Th>Criado</Th><Th /></tr></thead>
            <tbody>{rows.map((d) => (
              <Tr key={d.id}>
                <Td className="font-medium">{d.title}{d.is_clinical && <Badge variant="warning" className="ml-2">clínico</Badge>}</Td>
                <Td>{d.patient ? <Link className="hover:text-primary" href={`/app/alunos/${d.patient.id}?aba=documentos`}>{d.patient.full_name}</Link> : '—'}</Td>
                <Td>{label(documentType, d.type)}</Td>
                <Td><Badge variant={d.status === 'signed' ? 'success' : d.status === 'sent' ? 'info' : 'neutral'}>{label(documentStatus, d.status)}</Badge>{d.signed_at && <span className="ml-1 text-xs text-muted-foreground">{date(d.signed_at, ctx.tz)}</span>}</Td>
                <Td>{date(d.created_at, ctx.tz)}</Td>
                <Td><a href={`/imprimir/documento/${d.id}`} target="_blank" rel="noopener" className="inline-flex items-center gap-1 text-sm text-primary hover:underline"><Printer className="h-4 w-4" />PDF</a></Td>
              </Tr>
            ))}</tbody>
          </Table>
        </div>
      )}
      <Pagination page={page} total={count ?? 0} pageSize={PAGE} />
    </>
  );
}

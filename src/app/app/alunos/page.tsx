import Link from 'next/link';
import { Plus, Upload, Download, Users } from 'lucide-react';
import { requirePermission } from '@/lib/auth/context';
import { PageHeader, Table, Th, Td, Tr, EmptyState, Avatar } from '@/components/ui/misc';
import { Button } from '@/components/ui/button';
import { Badge, statusVariant } from '@/components/ui/badge';
import { SearchBox, FilterSelect, Pagination } from '@/components/app/list-controls';
import { patientStatus, label } from '@/lib/labels';
import { date, ageFrom } from '@/lib/format';
import { whatsappLink } from '@/lib/utils';

export const metadata = { title: 'Alunos' };
const PAGE = 25;

export default async function PatientsPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const ctx = await requirePermission('patients.view');
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.p ?? 1) || 1);
  const term = (sp.q ?? '').replace(/[%_,()]/g, ' ').trim();
  const digits = term.replace(/\D/g, '');

  let q = ctx.supabase.from('patients')
    .select('id, full_name, social_name, phone, whatsapp, email, status, birth_date, created_at, replacement_balance, unit_id, subscriptions(status, plans(name))', { count: 'exact' })
    .eq('organization_id', ctx.org.id).is('deleted_at', null);
  if (ctx.unitId) q = q.eq('unit_id', ctx.unitId);
  if (sp.status) q = q.eq('status', sp.status);
  if (term) {
    const ors = [`full_name.ilike.%${term}%`, `social_name.ilike.%${term}%`, `email.ilike.%${term}%`];
    if (digits.length >= 4) ors.push(`phone.ilike.%${digits.slice(-4)}%`, `whatsapp.ilike.%${digits.slice(-4)}%`, `cpf.ilike.%${digits.slice(0, 3)}%`);
    q = q.or(ors.join(','));
  }
  const { data, count, error } = await q.order('full_name').range((page - 1) * PAGE, page * PAGE - 1);
  const rows = (data ?? []) as any[];

  return (
    <>
      <PageHeader
        title="Alunos"
        description="Alunos e pacientes da clínica."
        actions={<>
          {ctx.can('patients.export') && <a href="/api/export/patients?format=xlsx"><Button variant="outline"><Download /> Exportar</Button></a>}
          {ctx.can('patients.create') && <Link href="/app/alunos/importar"><Button variant="outline"><Upload /> Importar</Button></Link>}
          {ctx.can('patients.create') && <Link href="/app/alunos/novo"><Button><Plus /> Novo aluno</Button></Link>}
        </>}
      />
      <div className="mb-4 flex flex-col gap-2 sm:flex-row">
        <SearchBox placeholder="Nome, telefone, e-mail ou CPF" />
        <FilterSelect param="status" label="Status" allLabel="Todos os status" options={Object.entries(patientStatus).map(([value, l]) => ({ value, label: l }))} />
      </div>
      {error ? <EmptyState title="Não foi possível carregar os alunos" /> : rows.length === 0 ? (
        <EmptyState icon={Users} title={term || sp.status ? 'Nenhum aluno encontrado' : 'Nenhum aluno cadastrado'}
          description={term || sp.status ? 'Ajuste a busca ou os filtros.' : 'Cadastre o primeiro aluno ou importe uma planilha.'}
          action={ctx.can('patients.create') && !term ? <Link href="/app/alunos/novo"><Button><Plus /> Novo aluno</Button></Link> : undefined} />
      ) : (
        <div className="space-y-3">
          <Table>
            <thead><tr><Th>Aluno</Th><Th className="hidden md:table-cell">Contato</Th><Th>Status</Th><Th className="hidden lg:table-cell">Plano</Th><Th className="hidden lg:table-cell">Reposições</Th><Th className="hidden sm:table-cell">Cadastro</Th></tr></thead>
            <tbody>
              {rows.map((p) => {
                const sub = (p.subscriptions ?? []).find((s: any) => s.status === 'active');
                const age = ageFrom(p.birth_date);
                const wa = whatsappLink(p.whatsapp ?? p.phone);
                return (
                  <Tr key={p.id}>
                    <Td>
                      <Link href={`/app/alunos/${p.id}`} className="flex items-center gap-3 hover:underline">
                        <Avatar name={p.social_name || p.full_name} size={32} />
                        <span><span className="font-medium">{p.social_name || p.full_name}</span>{age !== null && <span className="ml-2 text-xs text-muted-foreground">{age} anos</span>}</span>
                      </Link>
                    </Td>
                    <Td className="hidden md:table-cell">
                      <span className="block text-sm">{p.whatsapp ?? p.phone ?? '—'}</span>
                      {wa && <a href={wa} target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline">WhatsApp</a>}
                    </Td>
                    <Td><Badge variant={statusVariant[p.status] ?? 'neutral'}>{label(patientStatus, p.status)}</Badge></Td>
                    <Td className="hidden lg:table-cell">{sub?.plans?.name ?? <span className="text-muted-foreground">—</span>}</Td>
                    <Td className="hidden tabular-nums lg:table-cell">{p.replacement_balance || '—'}</Td>
                    <Td className="hidden text-muted-foreground sm:table-cell">{date(p.created_at, ctx.tz)}</Td>
                  </Tr>
                );
              })}
            </tbody>
          </Table>
          <Pagination page={page} total={count ?? 0} pageSize={PAGE} />
        </div>
      )}
    </>
  );
}

import Link from 'next/link';
import { Activity, Plus } from 'lucide-react';
import { requirePermission } from '@/lib/auth/context';
import { PageHeader, Table, Th, Td, Tr, EmptyState, Section } from '@/components/ui/misc';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { TabLinks } from '@/components/ui/tab-links';
import { ResourceSection } from '@/components/resource/resource-page';
import { date, number } from '@/lib/format';
import { label, assessmentType } from '@/lib/labels';

export const metadata = { title: 'Avaliações' };

export default async function AssessmentsPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const ctx = await requirePermission('assessments.view');
  const sp = await searchParams;
  const tab = ['reavaliacoes', 'campos'].includes(sp.aba) ? sp.aba : 'recentes';
  const [{ data: recent }, { data: due }] = await Promise.all([
    tab === 'recentes' ? ctx.supabase.from('assessments').select('id, type, form_name, assessed_on, weight_kg, bmi, status, patients(id, full_name), staff(full_name)').eq('organization_id', ctx.org.id).order('assessed_on', { ascending: false }).limit(60) : Promise.resolve({ data: [] }),
    tab === 'reavaliacoes' ? ctx.supabase.rpc('patients_due_reassessment', { p_org: ctx.org.id, p_limit: 200 }) : Promise.resolve({ data: [] }),
  ]);
  return (
    <>
      <PageHeader title="Avaliações" description="Avaliações físicas, funcionais e posturais com comparação histórica."
        actions={ctx.can('assessments.create') ? <Link href="/app/avaliacoes/nova"><Button><Plus /> Nova avaliação</Button></Link> : undefined} />
      <TabLinks base="/app/avaliacoes" active={tab} tabs={[{ id: 'recentes', label: 'Recentes' }, { id: 'reavaliacoes', label: 'Reavaliações pendentes' }, { id: 'campos', label: 'Campos configuráveis', hidden: !ctx.can('settings.edit') }]} />
      {tab === 'recentes' && ((recent ?? []).length === 0 ? <EmptyState icon={Activity} title="Nenhuma avaliação registrada" /> : (
        <Table>
          <thead><tr><Th>Data</Th><Th>Aluno</Th><Th>Tipo</Th><Th>Peso</Th><Th>IMC</Th><Th>Profissional</Th><Th>Status</Th></tr></thead>
          <tbody>
            {((recent ?? []) as any[]).map((a) => (
              <Tr key={a.id}>
                <Td><Link href={`/app/avaliacoes/${a.id}`} className="text-primary hover:underline">{date(a.assessed_on)}</Link></Td>
                <Td><Link href={`/app/alunos/${a.patients?.id}?aba=avaliacoes`} className="hover:underline">{a.patients?.full_name}</Link></Td>
                <Td>{a.form_name ?? label(assessmentType, a.type)}</Td>
                <Td className="tabular-nums">{a.weight_kg ? `${number(a.weight_kg, 1)} kg` : '—'}</Td>
                <Td className="tabular-nums">{a.bmi ? number(a.bmi, 1) : '—'}</Td>
                <Td>{a.staff?.full_name ?? '—'}</Td>
                <Td><Badge variant={a.status === 'finalized' ? 'success' : 'warning'}>{a.status === 'finalized' ? 'Finalizada' : 'Rascunho'}</Badge></Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      ))}
      {tab === 'reavaliacoes' && (
        <Section title="Alunos ativos sem avaliação recente" description="Regra: intervalo configurado em Configurações → Regras (padrão 90 dias).">
          {(due ?? []).length === 0 ? <p className="text-sm text-muted-foreground">Nenhuma reavaliação pendente.</p> : (
            <Table>
              <thead><tr><Th>Aluno</Th><Th>Última avaliação</Th><Th>Dias</Th><Th /></tr></thead>
              <tbody>
                {((due ?? []) as any[]).map((d) => (
                  <Tr key={d.patient_id}>
                    <Td><Link href={`/app/alunos/${d.patient_id}?aba=avaliacoes`} className="hover:underline">{d.full_name}</Link></Td>
                    <Td>{d.last_assessment ? date(d.last_assessment) : 'Nunca avaliado'}</Td>
                    <Td className="tabular-nums">{d.days_since ?? '—'}</Td>
                    <Td className="text-right">{ctx.can('assessments.create') && <Link href={`/app/avaliacoes/nova?aluno=${d.patient_id}`}><Button size="sm" variant="outline">Avaliar</Button></Link>}</Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          )}
        </Section>
      )}
      {tab === 'campos' && <ResourceSection resource="assessment_fields" searchParams={sp} />}
    </>
  );
}

import { requirePermission } from '@/lib/auth/context';
import { TabLinks } from '@/components/ui/tab-links';
import { PageHeader } from '@/components/ui/misc';
import { ResourceSection } from '@/components/resource/resource-page';
import { EvolutionTemplatesManager } from '@/components/app/settings/evolution-templates-manager';

export const metadata = { title: 'Modelos' };

export default async function ModelosPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const ctx = await requirePermission(['contracts.view', 'documents.view', 'communication.view', 'assessments.view', 'medical_records.view']);
  const sp = await searchParams;

  const tabs = [
    { id: 'contratos', label: 'Contratos', hidden: !ctx.can('contracts.view') },
    { id: 'documentos', label: 'Documentos', hidden: !ctx.can('documents.view') },
    { id: 'mensagens', label: 'Mensagens', hidden: !ctx.can('communication.view') },
    { id: 'anamneses', label: 'Anamneses', hidden: !ctx.can('assessments.view') },
    { id: 'avaliacao', label: 'Avaliação física', hidden: !ctx.can('assessments.view') },
    { id: 'evolucao', label: 'Evolução', hidden: !ctx.can('medical_records.view') },
  ];
  const firstVisible = tabs.find((t) => !t.hidden)?.id ?? 'contratos';
  const active = tabs.find((t) => t.id === sp.aba && !t.hidden)?.id ?? firstVisible;
  const base = '/app/configuracoes/modelos';

  let evolutionRows: { id: string; name: string; is_active: boolean; defaults: Record<string, string> | null }[] = [];
  if (active === 'evolucao') {
    const { data } = await ctx.supabase.from('evolution_templates').select('id, name, is_active, defaults').eq('organization_id', ctx.org.id).order('name');
    evolutionRows = data ?? [];
  }

  return (
    <>
      <PageHeader title="Modelos" description="Contratos, documentos, mensagens, anamneses, evoluções e avaliações." />
      <TabLinks tabs={tabs} active={active} base={base} />
      {active === 'contratos' && <ResourceSection resource="contract_templates" searchParams={sp} />}
      {active === 'documentos' && <ResourceSection resource="document_templates" searchParams={sp} />}
      {active === 'mensagens' && <ResourceSection resource="message_templates" searchParams={sp} />}
      {active === 'anamneses' && <ResourceSection resource="anamnesis_templates" searchParams={sp} onRowClick="/app/configuracoes/modelos/anamnese/{id}" />}
      {active === 'avaliacao' && <ResourceSection resource="assessment_fields" searchParams={sp} />}
      {active === 'evolucao' && <EvolutionTemplatesManager rows={evolutionRows} canEdit={ctx.can('medical_records.edit')} />}
    </>
  );
}

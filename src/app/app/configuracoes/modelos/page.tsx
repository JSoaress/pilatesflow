import { requirePermission } from '@/lib/auth/context';
import { PageHeader } from '@/components/ui/misc';
import { TabLinks } from '@/components/ui/tab-links';
import { ResourceSection } from '@/components/resource/resource-page';
import { EvolutionTemplatesManager } from '@/components/app/settings/evolution-templates-manager';
import { EvaluationTemplatesList } from '@/components/app/evaluation/templates-list';
import { listTemplates } from '@/lib/evaluation/server';

export const metadata = { title: 'Modelos' };

export default async function TemplatesPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const ctx = await requirePermission(['settings.view', 'contracts.view', 'documents.view', 'communication.view', 'assessments.view', 'medical_records.view']);
  const sp = await searchParams;
  const tabs = [
    { id: 'fichas', label: 'Fichas de avaliação', hidden: !ctx.can('assessments.view') },
    { id: 'documentos', label: 'Documentos e folhas', hidden: !ctx.can('documents.view') },
    { id: 'contratos', label: 'Contratos', hidden: !ctx.can('contracts.view') },
    { id: 'mensagens', label: 'Mensagens', hidden: !ctx.can('communication.view') },
    { id: 'anamnese', label: 'Anamnese', hidden: !ctx.can('assessments.view') },
    { id: 'evolucao', label: 'Evolução', hidden: !ctx.can('medical_records.view') },
    { id: 'avaliacao', label: 'Campos de avaliação', hidden: !ctx.can('assessments.view') },
  ];
  const firstVisible = tabs.find((t) => !t.hidden)?.id ?? 'fichas';
  // compatibilidade com links antigos (?aba=anamneses)
  const asked = sp.aba === 'anamneses' ? 'anamnese' : sp.aba;
  const tab = tabs.find((t) => t.id === asked && !t.hidden)?.id ?? firstVisible;

  let body: React.ReactNode = null;
  if (tab === 'fichas') body = <EvaluationTemplatesList items={await listTemplates(ctx, true)} canEdit={ctx.can('settings.edit')} />;
  if (tab === 'documentos') body = <ResourceSection resource="document_templates" searchParams={sp} />;
  if (tab === 'contratos') body = <ResourceSection resource="contract_templates" searchParams={sp} />;
  if (tab === 'mensagens') body = <ResourceSection resource="message_templates" searchParams={sp} />;
  if (tab === 'avaliacao') body = <ResourceSection resource="assessment_fields" searchParams={sp} />;
  if (tab === 'anamnese') body = <ResourceSection resource="anamnesis_templates" searchParams={sp} onRowClick="/app/configuracoes/modelos/anamnese/{id}" />;
  if (tab === 'evolucao') {
    const { data } = await ctx.supabase.from('evolution_templates').select('id, name, is_active, defaults').eq('organization_id', ctx.org.id).order('name');
    body = <EvolutionTemplatesManager rows={(data ?? []) as any[]} canEdit={ctx.can('settings.edit') || ctx.can('medical_records.edit')} />;
  }
  return (
    <>
      <PageHeader title="Modelos" description={'Use variáveis como {{nome_aluno}} e {{data_hoje}}. Folhas de orientação (tipo "Orientações ao aluno") aparecem em Imprimir → Folha para o aluno.'} />
      <TabLinks base="/app/configuracoes/modelos" active={tab} tabs={tabs} />
      {body}
    </>
  );
}

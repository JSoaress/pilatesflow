import Link from 'next/link';
import { requirePermission } from '@/lib/auth/context';
import { PageHeader, Section } from '@/components/ui/misc';
import { TabLinks } from '@/components/ui/tab-links';
import { ResourceSection } from '@/components/resource/resource-page';
import { EvolutionTemplates } from '@/components/app/settings/evolution-templates';
import { EvaluationTemplatesList } from '@/components/app/evaluation/templates-list';
import { listTemplates } from '@/lib/evaluation/server';

export const metadata = { title: 'Modelos' };

export default async function TemplatesPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const ctx = await requirePermission('settings.view');
  const sp = await searchParams;
  const tabs = [
    { id: 'fichas', label: 'Fichas de avaliação' }, { id: 'documentos', label: 'Documentos e folhas' }, { id: 'contratos', label: 'Contratos' }, { id: 'mensagens', label: 'Mensagens' },
    { id: 'anamnese', label: 'Anamnese' }, { id: 'evolucao', label: 'Evolução' }, { id: 'avaliacao', label: 'Campos de avaliação' },
  ];
  const tab = tabs.some((t) => t.id === sp.aba) ? sp.aba : 'fichas';
  let body: React.ReactNode = null;
  if (tab === 'fichas') body = <EvaluationTemplatesList items={await listTemplates(ctx, true)} canEdit={ctx.can('settings.edit') && ctx.can('assessments.edit')} />;
  if (tab === 'documentos') body = <ResourceSection resource="document_templates" searchParams={sp} />;
  if (tab === 'contratos') body = <ResourceSection resource="contract_templates" searchParams={sp} />;
  if (tab === 'mensagens') body = <ResourceSection resource="message_templates" searchParams={sp} />;
  if (tab === 'avaliacao') body = <ResourceSection resource="assessment_fields" searchParams={sp} />;
  if (tab === 'evolucao') {
    const { data } = await ctx.supabase.from('evolution_templates').select('id, name, is_active, defaults').eq('organization_id', ctx.org.id).order('name');
    body = <EvolutionTemplates items={(data ?? []) as any[]} canEdit={ctx.can('settings.edit') || ctx.can('medical_records.edit')} />;
  }
  if (tab === 'anamnese') {
    if (sp.modelo) {
      const { data: t } = await ctx.supabase.from('anamnesis_templates').select('id, name').eq('id', sp.modelo).eq('organization_id', ctx.org.id).maybeSingle();
      body = (
        <Section title={`Perguntas — ${t?.name ?? ''}`} actions={<Link href="/app/configuracoes/modelos?aba=anamnese" className="text-sm text-primary hover:underline">← Modelos de anamnese</Link>}>
          {t ? <ResourceSection resource="anamnesis_questions" fixed={{ template_id: t.id }} hideSearch compact /> : <p className="text-sm text-muted-foreground">Modelo não encontrado.</p>}
        </Section>
      );
    } else body = <ResourceSection resource="anamnesis_templates" searchParams={sp} onRowClick="/app/configuracoes/modelos?aba=anamnese&modelo={id}" />;
  }
  return (
    <>
      <PageHeader title="Modelos" description={'Use variáveis como {{nome_aluno}} e {{data_hoje}}. Folhas de orientação (tipo "Orientações ao aluno") aparecem em Imprimir → Folha para o aluno.'} />
      <TabLinks base="/app/configuracoes/modelos" active={tab} tabs={tabs} />
      {body}
    </>
  );
}

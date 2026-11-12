import Link from 'next/link';
import { notFound } from 'next/navigation';
import { FileDown } from 'lucide-react';
import { requirePermission } from '@/lib/auth/context';
import { PageHeader, Section } from '@/components/ui/misc';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ResourceSection } from '@/components/resource/resource-page';

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requirePermission('assessments.view');
  const { data } = await ctx.supabase.from('ficha_templates').select('name').eq('id', id).maybeSingle();
  return { title: data?.name ?? 'Modelo de ficha' };
}

export default async function FichaTemplateDetail({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const ctx = await requirePermission('assessments.view');
  const { id } = await params;
  const sp = await searchParams;
  const { data: tpl } = await ctx.supabase.from('ficha_templates').select('*').eq('id', id).eq('organization_id', ctx.org.id).maybeSingle();
  if (!tpl) notFound();

  return (
    <>
      <PageHeader
        title={tpl.name}
        description={tpl.description || 'Perguntas que compõem esta ficha de avaliação.'}
        back={{ href: '/app/configuracoes/modelos?aba=fichas', label: 'Modelos' }}
        actions={
          <>
            {tpl.is_default && <Badge>Padrão</Badge>}
            <Badge variant={tpl.is_active ? 'success' : 'neutral'}>{tpl.is_active ? 'Ativo' : 'Inativo'}</Badge>
            <Link href={`/api/ficha-templates/${id}/pdf`} target="_blank"><Button size="sm" variant="outline"><FileDown /> Imprimir em branco</Button></Link>
          </>
        }
      />
      <Section title="Perguntas" description="A ordem de exibição é definida pelo campo &quot;Ordem&quot; de cada pergunta.">
        <ResourceSection resource="ficha_questions" searchParams={sp} fixed={{ template_id: id }} compact hideSearch />
      </Section>
    </>
  );
}

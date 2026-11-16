import { notFound } from 'next/navigation';
import { requirePermission } from '@/lib/auth/context';
import { PageHeader } from '@/components/ui/misc';
import { FormBuilder } from '@/components/app/evaluation/builder';

export const metadata = { title: 'Editar ficha de avaliação' };

export default async function EditFormTemplate({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requirePermission('settings.edit');
  const { id } = await params;
  const { data: t } = await ctx.supabase.from('evaluation_templates').select('id, name, specialty, description, schema, based_on, version').eq('id', id).eq('organization_id', ctx.org.id).maybeSingle();
  if (!t) notFound();
  const r = t as any;
  return (
    <>
      <PageHeader title={`Editar — ${r.name}`} description={`Versão ${r.version}. Avaliações já feitas continuam com a versão usada no dia.`} back={{ href: '/app/configuracoes/modelos?aba=fichas', label: 'Fichas' }} />
      <FormBuilder init={{ id: r.id, name: r.name, specialty: r.specialty ?? '', description: r.description ?? '', based_on: r.based_on, sections: r.schema?.sections ?? [], summary: r.schema?.summary ?? [] }} />
    </>
  );
}

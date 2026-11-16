import { requirePermission } from '@/lib/auth/context';
import { PageHeader } from '@/components/ui/misc';
import { FormBuilder } from '@/components/app/evaluation/builder';
import { loadTemplate } from '@/lib/evaluation/server';

export const metadata = { title: 'Nova ficha de avaliação' };

export default async function NewFormTemplate({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const ctx = await requirePermission('settings.edit');
  const sp = await searchParams;
  const base = sp.base ? await loadTemplate(ctx, sp.base) : null;
  return (
    <>
      <PageHeader title={base ? `Nova ficha a partir de “${base.name}”` : 'Nova ficha de avaliação'} back={{ href: '/app/configuracoes/modelos?aba=fichas', label: 'Fichas' }} />
      <FormBuilder init={{ id: null, name: base ? `${base.name} (cópia)` : '', specialty: base?.specialty ?? '', description: base?.description ?? '', based_on: base?.key ?? null, sections: base?.sections ?? [], summary: base?.summary ?? [] }} />
    </>
  );
}

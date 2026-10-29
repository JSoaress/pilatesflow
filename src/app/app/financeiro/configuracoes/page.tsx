import { requirePermission } from '@/lib/auth/context';
import { PageHeader } from '@/components/ui/misc';
import { TabLinks } from '@/components/ui/tab-links';
import { ResourceSection } from '@/components/resource/resource-page';

export const metadata = { title: 'Configurações financeiras' };

export default async function FinanceSettings({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  await requirePermission('finance.edit');
  const sp = await searchParams;
  const tab = ['contas', 'formas'].includes(sp.aba) ? sp.aba : 'categorias';
  return (
    <>
      <PageHeader title="Categorias, contas e formas de pagamento" />
      <TabLinks base="/app/financeiro/configuracoes" active={tab} tabs={[{ id: 'categorias', label: 'Categorias e subcategorias' }, { id: 'contas', label: 'Contas / caixas' }, { id: 'formas', label: 'Formas de pagamento' }]} />
      {tab === 'categorias' && <ResourceSection resource="financial_categories" searchParams={sp} />}
      {tab === 'contas' && <ResourceSection resource="cash_accounts" searchParams={sp} />}
      {tab === 'formas' && <ResourceSection resource="payment_methods" searchParams={sp} />}
    </>
  );
}

import { requirePermission } from '@/lib/auth/context';
import { FinanceNav } from '@/components/app/finance/finance-nav';

export default async function FinanceLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requirePermission(['finance.view', 'commissions.view']);
  return (
    <>
      <FinanceNav showFinance={ctx.can('finance.view')} showCommissions={ctx.can('commissions.view')} showSettings={ctx.can('finance.edit')} />
      {children}
    </>
  );
}

'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';

export function FinanceNav({ showFinance, showCommissions, showSettings }: { showFinance: boolean; showCommissions: boolean; showSettings: boolean }) {
  const pathname = usePathname();
  const items = [
    { href: '/app/financeiro', label: 'Painel', show: showFinance },
    { href: '/app/financeiro/receber', label: 'Contas a receber', show: showFinance },
    { href: '/app/financeiro/pagar', label: 'Contas a pagar', show: showFinance },
    { href: '/app/financeiro/inadimplencia', label: 'Inadimplência', show: showFinance },
    { href: '/app/financeiro/fluxo-caixa', label: 'Fluxo de caixa', show: showFinance },
    { href: '/app/financeiro/comissoes', label: 'Comissões', show: showCommissions },
    { href: '/app/financeiro/configuracoes', label: 'Categorias e contas', show: showSettings },
  ].filter((i) => i.show);
  return (
    <nav aria-label="Financeiro" className="mb-6 flex gap-1 overflow-x-auto border-b scrollbar-thin">
      {items.map((i) => {
        const active = i.href === '/app/financeiro' ? pathname === i.href : pathname.startsWith(i.href);
        return <Link key={i.href} href={i.href} aria-current={active ? 'page' : undefined} className={cn('-mb-px whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-medium', active ? 'border-primary' : 'border-transparent text-muted-foreground hover:text-foreground')}>{i.label}</Link>;
      })}
    </nav>
  );
}

'use client';
import * as React from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { Select, Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

/** Filtro de período: Hoje, 7 dias, 30 dias, mês atual, mês anterior, ano ou personalizado. */
export function PeriodFilter({ preset, from, to }: { preset: string; from: string; to: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const [custom, setCustom] = React.useState({ de: from, ate: to });
  const go = (params: Record<string, string | null>) => {
    const n = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(params)) if (v === null) n.delete(k); else n.set(k, v);
    router.replace(`${pathname}?${n.toString()}`, { scroll: false });
  };
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select aria-label="Período" className="w-auto" value={preset} onChange={(e) => go(e.target.value === 'custom' ? { periodo: 'custom', de: custom.de, ate: custom.ate } : { periodo: e.target.value, de: null, ate: null })}>
        <option value="hoje">Hoje</option><option value="7d">Últimos 7 dias</option><option value="30d">Últimos 30 dias</option>
        <option value="mes">Mês atual</option><option value="mes_anterior">Mês anterior</option><option value="ano">Ano</option><option value="custom">Período personalizado</option>
      </Select>
      {preset === 'custom' && (
        <>
          <Input type="date" aria-label="De" className="w-auto" value={custom.de} onChange={(e) => setCustom({ ...custom, de: e.target.value })} />
          <Input type="date" aria-label="Até" className="w-auto" value={custom.ate} onChange={(e) => setCustom({ ...custom, ate: e.target.value })} />
          <Button variant="outline" onClick={() => go({ periodo: 'custom', de: custom.de, ate: custom.ate })}>Aplicar</Button>
        </>
      )}
    </div>
  );
}

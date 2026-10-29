'use client';
import * as React from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { Select, Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

export function resolvePeriod(sp: Record<string, string | undefined>, today: string) {
  const preset = sp.periodo ?? 'mes';
  const [y, m] = today.split('-').map(Number);
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const addD = (n: number) => { const [a, b, c] = today.split('-').map(Number); return iso(new Date(Date.UTC(a, b - 1, c + n))); };
  switch (preset) {
    case 'hoje': return { preset, from: today, to: today };
    case '7d': return { preset, from: addD(-6), to: today };
    case '30d': return { preset, from: addD(-29), to: today };
    case 'mes_anterior': return { preset, from: iso(new Date(Date.UTC(y, m - 2, 1))), to: iso(new Date(Date.UTC(y, m - 1, 0))) };
    case 'ano': return { preset, from: `${y}-01-01`, to: `${y}-12-31` };
    case 'custom': {
      const from = /^\d{4}-\d{2}-\d{2}$/.test(sp.de ?? '') ? sp.de! : today;
      const to = /^\d{4}-\d{2}-\d{2}$/.test(sp.ate ?? '') ? sp.ate! : today;
      return { preset, from: from <= to ? from : to, to: from <= to ? to : from };
    }
    default: return { preset: 'mes', from: iso(new Date(Date.UTC(y, m - 1, 1))), to: iso(new Date(Date.UTC(y, m, 0))) };
  }
}

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

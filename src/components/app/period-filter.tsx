'use client';
import * as React from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { Select, Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

/** Filtro de período: Hoje, 7 dias, 30 dias, mês atual, mês anterior, ano ou personalizado. */
export function PeriodFilter({ preset, from, to }: { preset: string; from: string; to: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const [isPending, startTransition] = React.useTransition();
  // Estado local para refletir a escolha imediatamente: `preset` só muda quando o
  // servidor termina de responder, e sem isso o dropdown "volta" ao valor antigo
  // até a requisição concluir.
  const [localPreset, setLocalPreset] = React.useState(preset);
  const [custom, setCustom] = React.useState({ de: from, ate: to });

  React.useEffect(() => setLocalPreset(preset), [preset]);

  const go = (next: string, params: Record<string, string | null>) => {
    setLocalPreset(next);
    const n = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(params)) if (v === null) n.delete(k); else n.set(k, v);
    startTransition(() => router.replace(`${pathname}?${n.toString()}`, { scroll: false }));
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select aria-label="Período" className="w-auto" value={localPreset} disabled={isPending}
        onChange={(e) => go(e.target.value, e.target.value === 'custom' ? { periodo: 'custom', de: custom.de, ate: custom.ate } : { periodo: e.target.value, de: null, ate: null })}>
        <option value="hoje">Hoje</option><option value="7d">Últimos 7 dias</option><option value="30d">Últimos 30 dias</option>
        <option value="mes">Mês atual</option><option value="mes_anterior">Mês anterior</option><option value="ano">Ano</option><option value="custom">Período personalizado</option>
      </Select>
      {isPending && <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" aria-hidden />}
      {localPreset === 'custom' && (
        <>
          <Input type="date" aria-label="De" className="w-auto" value={custom.de} disabled={isPending} onChange={(e) => setCustom({ ...custom, de: e.target.value })} />
          <Input type="date" aria-label="Até" className="w-auto" value={custom.ate} disabled={isPending} onChange={(e) => setCustom({ ...custom, ate: e.target.value })} />
          <Button variant="outline" loading={isPending} onClick={() => go('custom', { periodo: 'custom', de: custom.de, ate: custom.ate })}>Aplicar</Button>
        </>
      )}
    </div>
  );
}

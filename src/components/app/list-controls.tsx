'use client';
import * as React from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { Search, ChevronLeft, ChevronRight } from 'lucide-react';
import { Input, Select } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

/** Busca com debounce sincronizada com a URL (?q=). */
export function SearchBox({ placeholder = 'Buscar…', param = 'q' }: { placeholder?: string; param?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const [q, setQ] = React.useState(sp.get(param) ?? '');
  React.useEffect(() => {
    const t = setTimeout(() => {
      if ((sp.get(param) ?? '') === q) return;
      const n = new URLSearchParams(sp.toString());
      if (q) n.set(param, q); else n.delete(param);
      n.delete('p');
      router.replace(`${pathname}?${n.toString()}`, { scroll: false });
    }, 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);
  return (
    <div className="relative w-full sm:max-w-xs">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={placeholder} className="pl-9" aria-label={placeholder} />
    </div>
  );
}

/** Filtro select sincronizado com a URL. */
export function FilterSelect({ param, options, label, allLabel = 'Todos' }: { param: string; options: { value: string; label: string }[]; label: string; allLabel?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  return (
    <Select aria-label={label} className="w-full sm:w-auto" value={sp.get(param) ?? ''} onChange={(e) => {
      const n = new URLSearchParams(sp.toString());
      if (e.target.value) n.set(param, e.target.value); else n.delete(param);
      n.delete('p');
      router.replace(`${pathname}?${n.toString()}`, { scroll: false });
    }}>
      <option value="">{allLabel}</option>
      {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </Select>
  );
}

export function Pagination({ page, total, pageSize }: { page: number; total: number; pageSize: number }) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages <= 1) return <p className="text-sm text-muted-foreground">{total} registro(s)</p>;
  const go = (p: number) => { const n = new URLSearchParams(sp.toString()); n.set('p', String(p)); router.replace(`${pathname}?${n.toString()}`); };
  return (
    <div className="flex items-center justify-between text-sm text-muted-foreground">
      <span>{total} registro(s) · página {page} de {pages}</span>
      <div className="flex gap-1">
        <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => go(page - 1)}><ChevronLeft /> Anterior</Button>
        <Button variant="outline" size="sm" disabled={page >= pages} onClick={() => go(page + 1)}>Próxima <ChevronRight /></Button>
      </div>
    </div>
  );
}

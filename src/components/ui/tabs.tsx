'use client';
import * as React from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';

/** Abas acessíveis; com `param` o estado fica na URL (?aba=...) e sobrevive ao recarregar. */
export function Tabs({ tabs, param, defaultTab, children }: {
  tabs: { id: string; label: React.ReactNode; hidden?: boolean }[];
  param?: string;
  defaultTab?: string;
  children: (active: string) => React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const visible = tabs.filter((t) => !t.hidden);
  const fromUrl = param ? sp.get(param) : null;
  const [local, setLocal] = React.useState(defaultTab ?? visible[0]?.id);
  const active = (fromUrl && visible.some((t) => t.id === fromUrl) ? fromUrl : null) ?? local ?? visible[0]?.id;
  const select = (id: string) => {
    setLocal(id);
    if (param) {
      const q = new URLSearchParams(sp.toString());
      q.set(param, id);
      router.replace(`${pathname}?${q.toString()}`, { scroll: false });
    }
  };
  const onKey = (e: React.KeyboardEvent, idx: number) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    const next = visible[(idx + (e.key === 'ArrowRight' ? 1 : visible.length - 1)) % visible.length];
    select(next.id);
    document.getElementById(`tab-${next.id}`)?.focus();
  };
  return (
    <div>
      <div role="tablist" className="mb-5 flex gap-1 overflow-x-auto border-b scrollbar-thin">
        {visible.map((t, i) => (
          <button
            key={t.id} id={`tab-${t.id}`} role="tab" type="button" aria-selected={active === t.id} tabIndex={active === t.id ? 0 : -1}
            onClick={() => select(t.id)} onKeyDown={(e) => onKey(e, i)}
            className={cn('-mb-px whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-medium transition-colors',
              active === t.id ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground')}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div role="tabpanel" aria-labelledby={`tab-${active}`}>{children(active)}</div>
    </div>
  );
}

'use client';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { Select } from '@/components/ui/input';

export function CompareSelect({ items, a, b }: { items: { id: string; label: string }[]; a: string; b: string }) {
  const router = useRouter();
  const sp = useSearchParams();
  const pathname = usePathname();
  const set = (k: 'a' | 'b', v: string) => { const n = new URLSearchParams(sp.toString()); n.set(k, v); router.replace(`${pathname}?${n.toString()}`); };
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <span>Comparar</span>
      <Select aria-label="Avaliação inicial" className="w-auto" value={a} onChange={(e) => set('a', e.target.value)}>{items.map((i) => <option key={i.id} value={i.id}>{i.label}</option>)}</Select>
      <span>com</span>
      <Select aria-label="Avaliação final" className="w-auto" value={b} onChange={(e) => set('b', e.target.value)}>{items.map((i) => <option key={i.id} value={i.id}>{i.label}</option>)}</Select>
    </div>
  );
}

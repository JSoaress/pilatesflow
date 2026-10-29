'use client';
import * as React from 'react';
import { Search, X, Loader2 } from 'lucide-react';
import { searchPatients, type PatientHit } from '@/lib/actions/patients';
import { cn } from '@/lib/utils';

export type PickedPatient = { id: string; name: string; credits?: number };

/** Seletor de alunos com busca no servidor (um ou vários). */
export function PatientPicker({ value, onChange, multiple = true, placeholder = 'Buscar aluno por nome ou telefone…', max }: { value: PickedPatient[]; onChange: (v: PickedPatient[]) => void; multiple?: boolean; placeholder?: string; max?: number }) {
  const [q, setQ] = React.useState('');
  const [hits, setHits] = React.useState<PatientHit[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [open, setOpen] = React.useState(false);
  React.useEffect(() => {
    if (q.trim().length < 2) { setHits([]); return; }
    setLoading(true);
    const t = setTimeout(async () => {
      const r = await searchPatients(q);
      setHits(r.ok ? r.data ?? [] : []);
      setLoading(false);
      setOpen(true);
    }, 250);
    return () => clearTimeout(t);
  }, [q]);
  const add = (h: PatientHit) => {
    const item = { id: h.id, name: h.social_name || h.full_name, credits: h.replacement_balance };
    onChange(multiple ? (value.some((v) => v.id === h.id) ? value : [...value, item]) : [item]);
    setQ(''); setOpen(false);
  };
  const full = max !== undefined && value.length >= max;
  return (
    <div className="space-y-2">
      {value.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {value.map((p) => (
            <span key={p.id} className="inline-flex items-center gap-1 rounded-full bg-primary-soft py-1 pl-3 pr-1 text-sm text-primary">
              {p.name}
              <button type="button" onClick={() => onChange(value.filter((x) => x.id !== p.id))} className="rounded-full p-0.5 hover:bg-primary/10" aria-label={`Remover ${p.name}`}><X className="h-3.5 w-3.5" /></button>
            </span>
          ))}
        </div>
      )}
      {(!full && (multiple || value.length === 0)) && (
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input value={q} onChange={(e) => setQ(e.target.value)} onFocus={() => hits.length && setOpen(true)} onBlur={() => setTimeout(() => setOpen(false), 150)}
            placeholder={placeholder} aria-label="Buscar aluno"
            className="h-10 w-full rounded-lg border border-input bg-card pl-9 pr-9 text-sm focus-visible:ring-2 focus-visible:ring-ring" />
          {loading && <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />}
          {open && (
            <ul role="listbox" className="absolute z-50 mt-1 max-h-64 w-full overflow-y-auto rounded-lg border bg-card p-1 shadow-lift">
              {hits.length === 0 && !loading && <li className="px-3 py-3 text-sm text-muted-foreground">Nenhum aluno encontrado.</li>}
              {hits.map((h) => (
                <li key={h.id}>
                  <button type="button" role="option" aria-selected={false} onMouseDown={(e) => e.preventDefault()} onClick={() => add(h)}
                    className={cn('flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm hover:bg-muted')}>
                    <span>{h.social_name || h.full_name}<span className="block text-xs text-muted-foreground">{h.phone ?? ''}</span></span>
                    {h.replacement_balance > 0 && <span className="text-xs text-primary">{h.replacement_balance} reposição(ões)</span>}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

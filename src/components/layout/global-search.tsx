'use client';
import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Search, User, CalendarDays, Receipt, FileText, UserCog, Target, Loader2 } from 'lucide-react';
import { globalSearch, type SearchHit } from '@/lib/actions/shell';
import { cn } from '@/lib/utils';

const ICON: Record<string, React.ElementType> = { patient: User, appointment: CalendarDays, payment: Receipt, document: FileText, staff: UserCog, lead: Target };
const TYPE: Record<string, string> = { patient: 'Aluno', appointment: 'Agendamento', payment: 'Pagamento', document: 'Documento', staff: 'Profissional', lead: 'Lead' };

/** Busca global (Ctrl+K): alunos, telefone, CPF, profissionais, agendamentos, pagamentos e documentos. */
export function GlobalSearch() {
  const router = useRouter();
  const [q, setQ] = React.useState('');
  const [hits, setHits] = React.useState<SearchHit[]>([]);
  const [open, setOpen] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [idx, setIdx] = React.useState(0);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const boxRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); inputRef.current?.focus(); }
    };
    const onDoc = (e: MouseEvent) => { if (!boxRef.current?.contains(e.target as Node)) setOpen(false); };
    window.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onDoc);
    return () => { window.removeEventListener('keydown', onKey); document.removeEventListener('mousedown', onDoc); };
  }, []);

  React.useEffect(() => {
    if (q.trim().length < 2) { setHits([]); return; }
    setLoading(true);
    const t = setTimeout(async () => {
      const r = await globalSearch(q);
      setHits(r.ok ? r.data ?? [] : []);
      setIdx(0);
      setLoading(false);
      setOpen(true);
    }, 220);
    return () => clearTimeout(t);
  }, [q]);

  const go = (h: SearchHit) => { setOpen(false); setQ(''); router.push(h.href); };

  return (
    <div ref={boxRef} className="relative max-w-xl">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
      <input
        ref={inputRef}
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onFocus={() => hits.length && setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') { e.preventDefault(); setIdx((i) => Math.min(i + 1, hits.length - 1)); }
          if (e.key === 'ArrowUp') { e.preventDefault(); setIdx((i) => Math.max(i - 1, 0)); }
          if (e.key === 'Enter' && hits[idx]) go(hits[idx]);
          if (e.key === 'Escape') setOpen(false);
        }}
        placeholder="Buscar aluno, telefone, CPF, recibo…"
        aria-label="Busca global"
        role="combobox"
        aria-expanded={open}
        aria-controls="global-search-results"
        className="h-10 w-full rounded-lg border border-input bg-card pl-9 pr-16 text-sm shadow-sm placeholder:text-muted-foreground/70 focus-visible:ring-2 focus-visible:ring-ring"
      />
      <span className="pointer-events-none absolute right-3 top-1/2 hidden -translate-y-1/2 rounded border px-1.5 text-[10px] text-muted-foreground sm:block">Ctrl K</span>
      {loading && <Loader2 className="absolute right-14 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />}
      {open && q.length >= 2 && (
        <div id="global-search-results" role="listbox" className="absolute left-0 right-0 z-50 mt-1 max-h-[70vh] overflow-y-auto rounded-xl border bg-card p-1 shadow-lift">
          {hits.length === 0 && !loading && <p className="px-3 py-6 text-center text-sm text-muted-foreground">Nenhum resultado para “{q}”.</p>}
          {hits.map((h, i) => {
            const Icon = ICON[h.type] ?? FileText;
            return (
              <button key={h.type + h.id + i} role="option" aria-selected={i === idx} onMouseEnter={() => setIdx(i)} onClick={() => go(h)}
                className={cn('flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left', i === idx && 'bg-muted')}>
                <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{h.title}</span>
                  {h.subtitle && <span className="block truncate text-xs text-muted-foreground">{h.subtitle}</span>}
                </span>
                <span className="text-[11px] text-muted-foreground">{TYPE[h.type]}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

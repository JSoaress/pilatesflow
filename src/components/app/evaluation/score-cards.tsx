import type { Field, Scores, Tone } from '@/lib/evaluation/types';
import { cn } from '@/lib/utils';

export const TONE: Record<Tone | 'none', string> = {
  ok: 'border-success/40 bg-success-soft text-success',
  info: 'border-info/40 bg-info-soft text-info',
  warn: 'border-warning/40 bg-warning-soft text-warning',
  alert: 'border-destructive/40 bg-destructive-soft text-destructive',
  none: 'border-border bg-muted/40 text-muted-foreground',
};

/** Cartões com os resultados calculados (destaques da ficha). */
export function ScoreCards({ ids, fields, scores, className }: { ids: string[]; fields: Field[]; scores: Scores; className?: string }) {
  const items = ids.map((id) => ({ f: fields.find((x) => x.id === id), s: scores[id] })).filter((x) => x.f);
  if (!items.length) return null;
  return (
    <div className={cn('grid gap-3 sm:grid-cols-2 xl:grid-cols-4', className)}>
      {items.map(({ f, s }) => {
        const tone = s?.band?.tone ?? 'none';
        const empty = !s || s.value === null;
        return (
          <div key={f!.id} className={cn('rounded-xl border p-3', empty ? TONE.none : TONE[tone])}>
            <p className="text-xs font-medium uppercase tracking-wide opacity-80">{f!.label}</p>
            <p className="mt-1 text-lg font-semibold text-foreground">{empty ? '—' : s!.text}</p>
            {!empty && s!.band && <p className="text-xs font-medium">{s!.band.label}</p>}
            {empty && <p className="text-xs">{s?.text && s.text !== '—' ? s.text : 'Aguardando respostas'}</p>}
          </div>
        );
      })}
    </div>
  );
}

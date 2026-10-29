// Utilitários da agenda (sem dependências de servidor).
export type View = 'dia' | 'semana' | 'mes' | 'lista' | 'profissional' | 'sala' | 'equipamento' | 'modalidade';
export const VIEWS: { id: View; label: string }[] = [
  { id: 'dia', label: 'Dia' }, { id: 'semana', label: 'Semana' }, { id: 'mes', label: 'Mês' }, { id: 'lista', label: 'Lista' },
  { id: 'profissional', label: 'Por profissional' }, { id: 'sala', label: 'Por sala' }, { id: 'equipamento', label: 'Por equipamento' }, { id: 'modalidade', label: 'Por modalidade' },
];

export function addDays(iso: string, n: number) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}
export function weekday(iso: string) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}
/** Segunda-feira da semana da data */
export function weekStart(iso: string) {
  const wd = weekday(iso);
  return addDays(iso, wd === 0 ? -6 : 1 - wd);
}
export function monthGrid(iso: string) {
  const first = iso.slice(0, 8) + '01';
  const start = weekStart(first);
  const [y, m] = iso.split('-').map(Number);
  const last = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
  const end = addDays(weekStart(last), 6);
  return { start, end };
}
export function rangeFor(view: View, iso: string) {
  if (view === 'semana') { const s = weekStart(iso); return { from: s, to: addDays(s, 6) }; }
  if (view === 'mes') { const g = monthGrid(iso); return { from: g.start, to: g.end }; }
  if (view === 'lista') return { from: iso, to: addDays(iso, 6) };
  return { from: iso, to: iso };
}

/** Partes locais (data e minutos do dia) no fuso da clínica */
export function localParts(isoTs: string, tz: string) {
  const f = new Intl.DateTimeFormat('sv-SE', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false });
  const s = f.format(new Date(isoTs)); // "2026-10-20 18:00"
  const [date, time] = s.split(' ');
  const [hh, mm] = time.split(':').map(Number);
  return { date, minutes: (hh % 24) * 60 + mm, time: time.slice(0, 5) };
}
export function minutesToTime(m: number) {
  const h = Math.floor(m / 60), mi = m % 60;
  return `${String(h).padStart(2, '0')}:${String(mi).padStart(2, '0')}`;
}
export function timeToMinutes(t: string) {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

/** Distribui eventos sobrepostos em colunas lado a lado */
export function layoutEvents<T extends { start: number; end: number }>(events: T[]) {
  const sorted = [...events].sort((a, b) => a.start - b.start || b.end - a.end);
  const out: (T & { col: number; cols: number })[] = [];
  let cluster: (T & { col: number; cols: number })[] = [];
  let clusterEnd = -1;
  const flush = () => {
    const cols = Math.max(1, ...cluster.map((e) => e.col + 1));
    cluster.forEach((e) => (e.cols = cols));
    out.push(...cluster);
    cluster = [];
  };
  for (const e of sorted) {
    if (e.start >= clusterEnd && cluster.length) flush();
    const used = new Set(cluster.filter((c) => c.end > e.start).map((c) => c.col));
    let col = 0;
    while (used.has(col)) col++;
    cluster.push({ ...e, col, cols: 1 });
    clusterEnd = Math.max(clusterEnd, e.end);
  }
  if (cluster.length) flush();
  return out;
}

export const STATUS_STYLE: Record<string, string> = {
  scheduled: 'bg-info-soft border-info/40 text-foreground',
  confirmed: 'bg-primary-soft border-primary/40 text-foreground',
  replacement: 'bg-accent border-accent-foreground/30 text-foreground',
  present: 'bg-success-soft border-success/40 text-foreground',
  completed: 'bg-success-soft border-success/40 text-foreground',
  absent: 'bg-destructive-soft border-destructive/40 text-foreground',
  cancelled: 'bg-muted border-border text-muted-foreground line-through opacity-70',
  waiting: 'bg-warning-soft border-warning/40 text-foreground',
  group: 'bg-card border-border text-foreground',
};
export const LEGEND: [string, string][] = [
  ['scheduled', 'Agendado'], ['confirmed', 'Confirmado'], ['present', 'Presente / Concluído'], ['absent', 'Faltou'],
  ['replacement', 'Reposição'], ['waiting', 'Em espera'], ['cancelled', 'Cancelado'],
];

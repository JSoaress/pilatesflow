// Lógica pura de resolução de período (sem 'use client'): pode ser chamada
// diretamente em Server Components. O componente de UI (PeriodFilter) fica
// em period-filter.tsx — mantidos em arquivos separados porque qualquer export
// de um módulo 'use client' é tratado como referência de client component, e
// não pode ser invocado como função comum a partir do servidor.
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

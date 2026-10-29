'use client';
import { ResponsiveContainer, BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip, Legend, CartesianGrid, ComposedChart } from 'recharts';

const C = ['hsl(158 27% 38%)', 'hsl(28 55% 52%)', 'hsl(208 55% 48%)', 'hsl(2 60% 52%)', 'hsl(268 30% 52%)', 'hsl(45 75% 45%)'];
const axis = { fontSize: 11, fill: 'hsl(var(--muted-foreground))' };
const tooltipStyle = { background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 10, fontSize: 12 };
const brl = (v: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(v);
const fmt = (kind?: 'money' | 'percent' | 'number') => (v: number) => (kind === 'money' ? brl(v) : kind === 'percent' ? `${v}%` : String(v));

export type Series = { key: string; label: string; kind?: 'bar' | 'line' };

function Frame({ title, children, height = 260, empty }: { title: string; children: React.ReactNode; height?: number; empty?: boolean }) {
  return (
    <figure className="rounded-xl border bg-card p-4 shadow-soft">
      <figcaption className="mb-3 text-sm font-medium">{title}</figcaption>
      <div style={{ height }}>{empty ? <div className="flex h-full items-center justify-center text-sm text-muted-foreground">Sem dados no período.</div> : children}</div>
    </figure>
  );
}

export function BarCard({ title, data, x, series, format, stacked, height }: { title: string; data: Record<string, unknown>[]; x: string; series: Series[]; format?: 'money' | 'percent' | 'number'; stacked?: boolean; height?: number }) {
  return (
    <Frame title={title} height={height} empty={!data.length}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
          <XAxis dataKey={x} tick={axis} tickLine={false} axisLine={false} />
          <YAxis tick={axis} tickLine={false} axisLine={false} tickFormatter={fmt(format)} width={format === 'money' ? 72 : 40} />
          <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => fmt(format)(Number(v))} cursor={{ fill: 'hsl(var(--muted))' }} />
          {series.length > 1 && <Legend wrapperStyle={{ fontSize: 12 }} />}
          {series.map((s, i) => <Bar key={s.key} dataKey={s.key} name={s.label} fill={C[i % C.length]} radius={[4, 4, 0, 0]} stackId={stacked ? 'a' : undefined} maxBarSize={36} />)}
        </BarChart>
      </ResponsiveContainer>
    </Frame>
  );
}

export function LineCard({ title, data, x, series, format, height }: { title: string; data: Record<string, unknown>[]; x: string; series: Series[]; format?: 'money' | 'percent' | 'number'; height?: number }) {
  return (
    <Frame title={title} height={height} empty={!data.length}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
          <XAxis dataKey={x} tick={axis} tickLine={false} axisLine={false} />
          <YAxis tick={axis} tickLine={false} axisLine={false} tickFormatter={fmt(format)} width={format === 'money' ? 72 : 40} />
          <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => fmt(format)(Number(v))} />
          {series.length > 1 && <Legend wrapperStyle={{ fontSize: 12 }} />}
          {series.map((s, i) => <Line key={s.key} type="monotone" dataKey={s.key} name={s.label} stroke={C[i % C.length]} strokeWidth={2} dot={{ r: 2.5 }} connectNulls />)}
        </LineChart>
      </ResponsiveContainer>
    </Frame>
  );
}

export function ComboCard({ title, data, x, bars, lines, format, height }: { title: string; data: Record<string, unknown>[]; x: string; bars: Series[]; lines: Series[]; format?: 'money'; height?: number }) {
  return (
    <Frame title={title} height={height} empty={!data.length}>
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
          <XAxis dataKey={x} tick={axis} tickLine={false} axisLine={false} />
          <YAxis tick={axis} tickLine={false} axisLine={false} tickFormatter={fmt(format)} width={72} />
          <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => fmt(format)(Number(v))} />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          {bars.map((s, i) => <Bar key={s.key} dataKey={s.key} name={s.label} fill={C[i % C.length]} radius={[4, 4, 0, 0]} maxBarSize={28} />)}
          {lines.map((s, i) => <Line key={s.key} type="monotone" dataKey={s.key} name={s.label} stroke={C[(i + bars.length) % C.length]} strokeWidth={2.2} dot={{ r: 2.5 }} />)}
        </ComposedChart>
      </ResponsiveContainer>
    </Frame>
  );
}

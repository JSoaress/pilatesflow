'use client';
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, Legend, CartesianGrid } from 'recharts';

const COLORS = ['hsl(158 27% 34%)', 'hsl(30 60% 50%)', 'hsl(208 60% 45%)', 'hsl(2 64% 48%)', 'hsl(270 35% 50%)', 'hsl(45 80% 42%)'];

/** Gráfico de evolução histórica entre avaliações. */
export function EvolutionChart({ title, data, lines }: { title: string; data: Record<string, unknown>[]; lines: { key: string; label: string }[] }) {
  return (
    <figure className="rounded-xl border p-4">
      <figcaption className="mb-2 text-sm font-medium">{title}</figcaption>
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 5, right: 10, left: -15, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis dataKey="date" tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} />
            <YAxis tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} />
            <Tooltip contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 12 }} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            {lines.map((l, i) => <Line key={l.key} type="monotone" dataKey={l.key} name={l.label} stroke={COLORS[i % COLORS.length]} strokeWidth={2} dot={{ r: 3 }} connectNulls />)}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </figure>
  );
}

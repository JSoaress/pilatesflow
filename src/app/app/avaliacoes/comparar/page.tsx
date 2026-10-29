import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react';
import { requirePermission } from '@/lib/auth/context';
import { PageHeader, Section, EmptyState, Table, Th, Td, Tr } from '@/components/ui/misc';
import { EvolutionChart } from '@/components/app/clinical/evolution-chart';
import { CompareSelect } from '@/components/app/clinical/compare-select';
import { signedUrls } from '@/lib/storage';
import { date, number } from '@/lib/format';
import { posturalView, label, assessmentType } from '@/lib/labels';
import { cn } from '@/lib/utils';

export const metadata = { title: 'Comparar avaliações' };

export default async function ComparePage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const ctx = await requirePermission('assessments.view');
  const sp = await searchParams;
  if (!sp.aluno) return <EmptyState title="Selecione um aluno" description="Abra a comparação a partir da ficha do aluno ou de uma avaliação." />;
  const [{ data: patient }, { data: list }, { data: fields }] = await Promise.all([
    ctx.supabase.from('patients').select('id, full_name, social_name').eq('id', sp.aluno).eq('organization_id', ctx.org.id).maybeSingle(),
    ctx.supabase.from('assessments').select('*').eq('patient_id', sp.aluno).order('assessed_on'),
    ctx.supabase.from('assessment_fields').select('key, label, unit, higher_is_better').eq('organization_id', ctx.org.id).order('sort_order'),
  ]);
  const items = (list ?? []) as any[];
  if (!patient || items.length < 2) return <EmptyState title="São necessárias ao menos duas avaliações" description="Registre uma reavaliação para comparar antes × depois." />;
  const a = items.find((x) => x.id === sp.a) ?? items[0];
  const b = items.find((x) => x.id === sp.b && x.id !== a.id) ?? items[items.length - 1];
  const { data: photos } = await ctx.supabase.from('postural_photos').select('id, view, storage_path, assessment_id').in('assessment_id', [a.id, b.id]);
  const urls = await signedUrls(ctx, 'clinical', ((photos ?? []) as any[]).map((p) => p.storage_path), 900);
  const photoOf = (aid: string, view: string) => { const p = ((photos ?? []) as any[]).filter((x) => x.assessment_id === aid && x.view === view).pop(); return p ? urls[p.storage_path] : null; };

  const metrics: { key: string; label: string; unit?: string; better?: boolean | null; va: number | null; vb: number | null }[] = [
    { key: 'weight_kg', label: 'Peso', unit: 'kg', better: null, va: a.weight_kg, vb: b.weight_kg },
    { key: 'bmi', label: 'IMC', better: null, va: a.bmi, vb: b.bmi },
    { key: 'pain_scale', label: 'Dor (0–10)', better: false, va: a.pain_scale, vb: b.pain_scale },
    { key: 'borg_scale', label: 'Borg', better: false, va: a.borg_scale, vb: b.borg_scale },
    ...((fields ?? []) as any[]).map((f) => ({ key: f.key, label: f.label, unit: f.unit, better: f.higher_is_better, va: typeof a.data?.[f.key] === 'number' ? a.data[f.key] : null, vb: typeof b.data?.[f.key] === 'number' ? b.data[f.key] : null })),
  ].filter((m) => m.va !== null || m.vb !== null);
  const series = items.map((x) => ({ date: date(x.assessed_on), peso: x.weight_kg, dor: x.pain_scale, ...(x.data ?? {}) }));
  const chartKeys = ((fields ?? []) as any[]).filter((f) => items.filter((x) => typeof x.data?.[f.key] === 'number').length >= 2).slice(0, 6);

  return (
    <>
      <PageHeader title={`Comparação — ${patient.social_name || patient.full_name}`} back={{ href: `/app/alunos/${patient.id}?aba=avaliacoes`, label: 'Ficha do aluno' }} />
      <CompareSelect items={items.map((x) => ({ id: x.id, label: `${date(x.assessed_on)} · ${label(assessmentType, x.type)}` }))} a={a.id} b={b.id} />
      <div className="mt-6 space-y-6">
        <Section title={`Antes (${date(a.assessed_on)}) × Depois (${date(b.assessed_on)})`}>
          <Table>
            <thead><tr><Th>Medida</Th><Th className="text-right">Antes</Th><Th className="text-right">Depois</Th><Th className="text-right">Variação</Th></tr></thead>
            <tbody>
              {metrics.map((m) => {
                const d = m.va !== null && m.vb !== null ? Number(m.vb) - Number(m.va) : null;
                const good = d === null || d === 0 || m.better === null || m.better === undefined ? null : (d > 0) === !!m.better;
                return (
                  <Tr key={m.key}>
                    <Td>{m.label}{m.unit ? ` (${m.unit})` : ''}</Td>
                    <Td className="text-right tabular-nums">{m.va !== null ? number(m.va, 1) : '—'}</Td>
                    <Td className="text-right tabular-nums">{m.vb !== null ? number(m.vb, 1) : '—'}</Td>
                    <Td className={cn('text-right tabular-nums', good === true && 'text-success', good === false && 'text-destructive')}>
                      {d === null ? '—' : <span className="inline-flex items-center gap-1">{d > 0 ? <ArrowUpRight className="h-3.5 w-3.5" /> : d < 0 ? <ArrowDownRight className="h-3.5 w-3.5" /> : <Minus className="h-3.5 w-3.5" />}{d > 0 ? '+' : ''}{number(d, 1)}</span>}
                    </Td>
                  </Tr>
                );
              })}
            </tbody>
          </Table>
        </Section>
        <div className="grid gap-4 lg:grid-cols-2">
          <EvolutionChart title="Peso e dor ao longo do tempo" data={series} lines={[{ key: 'peso', label: 'Peso (kg)' }, { key: 'dor', label: 'Dor' }]} />
          {chartKeys.length > 0 && <EvolutionChart title="Testes e medidas" data={series} lines={chartKeys.map((f: any) => ({ key: f.key, label: f.label }))} />}
        </div>
        <Section title="Fotos posturais — antes × depois">
          <div className="grid gap-6 md:grid-cols-2">
            {(['anterior', 'posterior', 'right_lateral', 'left_lateral'] as const).map((v) => (
              <div key={v}>
                <p className="mb-2 text-sm font-medium">{posturalView[v]}</p>
                <div className="grid grid-cols-2 gap-2">
                  {[a, b].map((x, i) => {
                    const url = photoOf(x.id, v);
                    return (
                      <figure key={x.id} className="overflow-hidden rounded-lg border">
                        <div className="flex aspect-[3/4] items-center justify-center bg-muted">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          {url ? <img src={url} alt={`${posturalView[v]} ${i === 0 ? 'antes' : 'depois'}`} className="h-full w-full object-contain" /> : <span className="text-xs text-muted-foreground">Sem foto</span>}
                        </div>
                        <figcaption className="p-1.5 text-center text-xs text-muted-foreground">{i === 0 ? 'Antes' : 'Depois'} · {date(x.assessed_on)}</figcaption>
                      </figure>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </Section>
      </div>
    </>
  );
}

import { notFound } from 'next/navigation';
import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react';
import { requirePermission } from '@/lib/auth/context';
import { loadPrintOrg, auditPrint } from '@/lib/print';
import { PrintBar } from '@/components/print/print-bar';
import { PrintSheet, PrintSection, PrintFields, SignatureLine } from '@/components/print/doc';
import { date, number } from '@/lib/format';
import { label, assessmentType } from '@/lib/labels';

export const metadata = { title: 'Imprimir relatório de avaliação' };

/** Relatório de avaliação para o aluno: medidas e comparação com a anterior e com a inicial. */
export default async function PrintAssessment({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requirePermission('assessments.view');
  const { id } = await params;
  const { data: a } = await ctx.supabase.from('assessments').select('*, patient:patients(id, full_name, social_name, unit_id), staff(full_name, professional_registry)').eq('id', id).eq('organization_id', ctx.org.id).maybeSingle();
  if (!a) notFound();
  const pt = (a as any).patient;
  const [org, { data: all }, { data: fields }] = await Promise.all([
    loadPrintOrg(ctx, pt.unit_id),
    ctx.supabase.from('assessments').select('id, assessed_on, height_cm, weight_kg, bmi, pain_scale, data').eq('patient_id', pt.id).lte('assessed_on', a.assessed_on).order('assessed_on'),
    ctx.supabase.from('assessment_fields').select('key, label, unit, higher_is_better, section').eq('organization_id', ctx.org.id).order('sort_order'),
  ]);
  await auditPrint(ctx, 'assessments', id, { patient_id: pt.id });
  const hist = (all ?? []) as any[];
  const prev = hist.filter((x) => x.id !== a.id).pop() ?? null;
  const first = hist[0]?.id !== a.id ? hist[0] : null;

  const val = (x: any, k: string) => (x ? (k === 'weight_kg' || k === 'bmi' || k === 'pain_scale' ? x[k] : x.data?.[k]) : null);
  const fv = (v: unknown) => (v === null || v === undefined || v === '' ? '—' : String(v).replace('.', ','));
  const rows = [
    { key: 'weight_kg', label: 'Peso', unit: 'kg', better: null as boolean | null },
    { key: 'bmi', label: 'IMC', unit: '', better: null },
    { key: 'pain_scale', label: 'Dor (0 a 10)', unit: '', better: false },
    ...((fields ?? []) as any[]).map((f) => ({ key: f.key, label: f.label, unit: f.unit ?? '', better: f.higher_is_better as boolean | null })),
  ].filter((r) => typeof val(a, r.key) === 'number' || (val(a, r.key) !== null && val(a, r.key) !== undefined && !isNaN(Number(val(a, r.key)))));

  const Diff = ({ from, to, better }: { from: unknown; to: unknown; better: boolean | null }) => {
    if (from === null || from === undefined || to === null || to === undefined) return <span className="text-neutral-400">—</span>;
    const d = Number(to) - Number(from);
    if (Math.abs(d) < 0.05) return <span className="inline-flex items-center gap-0.5 text-neutral-500"><Minus className="h-3 w-3" />igual</span>;
    const good = better === null ? null : (d > 0) === better;
    return <span className={`inline-flex items-center gap-0.5 ${good === true ? 'text-green-700' : good === false ? 'text-red-700' : ''}`}>{d > 0 ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}{d > 0 ? '+' : ''}{number(d, 1)}</span>;
  };

  return (
    <>
      <PrintBar title={`Relatório de avaliação — ${pt.social_name || pt.full_name}`} />
      <PrintSheet org={org} title="Relatório de avaliação" subtitle={<>{pt.social_name || pt.full_name} · {date(a.assessed_on)} · {label(assessmentType, a.type)}</>}
        footerNote="Relatório informativo da sua avaliação no studio. Dúvidas? Fale com seu profissional.">
        <PrintSection title="Medidas">
          <table className="w-full border-collapse text-[9.5pt]">
            <thead><tr className="border-b-2 border-neutral-400 text-left">
              <th className="py-1">Medida</th>
              {first && <th className="py-1 text-right">Início<br /><span className="font-normal">{date(first.assessed_on)}</span></th>}
              {prev && prev.id !== first?.id && <th className="py-1 text-right">Anterior<br /><span className="font-normal">{date(prev.assessed_on)}</span></th>}
              <th className="py-1 text-right">Hoje<br /><span className="font-normal">{date(a.assessed_on)}</span></th>
              {prev && <th className="py-1 text-right">Variação</th>}
            </tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.key} className="border-b border-neutral-200">
                  <td className="py-1">{r.label}{r.unit ? ` (${r.unit})` : ''}</td>
                  {first && <td className="py-1 text-right tabular-nums">{fv(val(first, r.key))}</td>}
                  {prev && prev.id !== first?.id && <td className="py-1 text-right tabular-nums">{fv(val(prev, r.key))}</td>}
                  <td className="py-1 text-right font-semibold tabular-nums">{fv(val(a, r.key))}</td>
                  {prev && <td className="py-1 text-right tabular-nums"><Diff from={val(first ?? prev, r.key)} to={val(a, r.key)} better={r.better} /></td>}
                </tr>
              ))}
            </tbody>
          </table>
          {prev && <p className="mt-1 text-[8pt] text-neutral-500">Variação calculada em relação à {first ? 'avaliação inicial' : 'avaliação anterior'}. Verde = evolução favorável.</p>}
        </PrintSection>
        <PrintSection title="Conclusão e próximos passos">
          <PrintFields items={[['Conclusão', a.conclusion], ['Achados posturais', a.postural_findings], ['Próxima avaliação', a.next_assessment_on ? date(a.next_assessment_on) : null]]} />
        </PrintSection>
        {(a as any).staff && <SignatureLine name={(a as any).staff.full_name} detail={(a as any).staff.professional_registry} />}
      </PrintSheet>
    </>
  );
}

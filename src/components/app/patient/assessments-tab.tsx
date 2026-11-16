import Link from 'next/link';
import { Plus, GitCompare } from 'lucide-react';
import { getAppContext } from '@/lib/auth/context';
import { Section, Table, Th, Td, Tr, EmptyState } from '@/components/ui/misc';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { date, dateTime, number } from '@/lib/format';
import { label, assessmentType } from '@/lib/labels';
import { AnamnesisActions, NewAnamnesisButton } from '@/components/app/clinical/anamnesis-actions';
import { EvolutionChart } from '@/components/app/clinical/evolution-chart';

export async function AssessmentsTab({ patientId }: { patientId: string }) {
  const ctx = await getAppContext();
  const [assess, anam, templates, fields] = await Promise.all([
    ctx.supabase.from('assessments').select('id, type, form_name, form_scores, form_schema, assessed_on, weight_kg, height_cm, bmi, pain_scale, status, data, staff(full_name), next_assessment_on').eq('patient_id', patientId).order('assessed_on', { ascending: false }),
    ctx.supabase.from('anamnesis').select('id, status, created_at, completed_at, filled_by, public_token, token_expires_at, signature_name, questions_snapshot, answers').eq('patient_id', patientId).order('created_at', { ascending: false }),
    ctx.supabase.from('anamnesis_templates').select('id, name').eq('organization_id', ctx.org.id).eq('is_active', true),
    ctx.supabase.from('assessment_fields').select('key, label, unit').eq('organization_id', ctx.org.id).eq('is_active', true).order('sort_order'),
  ]);
  const list = (assess.data ?? []) as any[];
  const series = [...list].reverse().map((a) => ({ date: date(a.assessed_on), peso: a.weight_kg, imc: a.bmi, dor: a.pain_scale, ...(a.data ?? {}) }));
  const numericKeys = ((fields.data ?? []) as any[]).filter((f) => series.filter((s) => typeof (s as any)[f.key] === 'number').length >= 2).slice(0, 6);
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? '';

  // destaques e evolução dos escores das fichas
  const labelOf = (a: any, id: string) => a.form_schema?.sections?.flatMap((x: any) => x.fields).find((f: any) => f.id === id)?.label ?? id;
  const highlights = (a: any) => ((a.form_schema?.summary ?? []) as string[]).filter((id) => a.form_scores?.[id] && a.form_scores[id].value !== null)
    .slice(0, 3).map((id) => `${labelOf(a, id)}: ${a.form_scores[id].text}`).join(' · ');
  const byForm = new Map<string, any[]>();
  for (const a of [...list].reverse()) if (a.form_name && a.form_schema?.summary?.length) byForm.set(a.form_name, [...(byForm.get(a.form_name) ?? []), a]);
  const scoreHistory = [...byForm.entries()].filter(([, v]) => v.length >= 2).map(([name, v]) => ({
    name, dates: v.map((a) => a.assessed_on),
    rows: (v[v.length - 1].form_schema.summary as string[]).map((id) => ({ label: labelOf(v[v.length - 1], id), values: v.map((a) => a.form_scores?.[id]?.text ?? '—') })),
  }));

  return (
    <div className="space-y-6">
      <Section title="Avaliações e fichas"
        actions={<div className="flex gap-2">
          {list.length >= 2 && <Link href={`/app/avaliacoes/comparar?aluno=${patientId}`}><Button size="sm" variant="outline"><GitCompare /> Comparar</Button></Link>}
          {ctx.can('assessments.create') && <Link href={`/app/avaliacoes/nova?aluno=${patientId}`}><Button size="sm"><Plus /> Nova avaliação</Button></Link>}
        </div>}>
        {list.length === 0 ? <EmptyState title="Nenhuma avaliação" description="Registre a avaliação inicial para acompanhar a evolução." /> : (
          <Table>
            <thead><tr><Th>Data</Th><Th>Avaliação</Th><Th>Destaques</Th><Th>Peso</Th><Th>Dor</Th><Th>Profissional</Th><Th>Status</Th></tr></thead>
            <tbody>
              {list.map((a) => (
                <Tr key={a.id}>
                  <Td><Link href={`/app/avaliacoes/${a.id}`} className="font-medium text-primary hover:underline">{date(a.assessed_on)}</Link></Td>
                  <Td>{a.form_name ?? label(assessmentType, a.type)}</Td>
                  <Td className="max-w-[280px] text-xs text-muted-foreground">{highlights(a) || (a.bmi ? `IMC ${number(a.bmi, 1)}` : '—')}</Td>
                  <Td className="tabular-nums">{a.weight_kg ? `${number(a.weight_kg, 1)} kg` : '—'}</Td>
                  <Td className="tabular-nums">{a.pain_scale ?? '—'}</Td>
                  <Td>{a.staff?.full_name ?? '—'}</Td>
                  <Td><Badge variant={a.status === 'finalized' ? 'success' : 'warning'}>{a.status === 'finalized' ? 'Finalizada' : 'Rascunho'}</Badge></Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        )}
        {scoreHistory.length > 0 && (
          <div className="mt-6 space-y-4">
            {scoreHistory.map((h) => (
              <div key={h.name} className="overflow-x-auto rounded-lg border">
                <p className="border-b bg-muted/40 px-3 py-2 text-sm font-medium">Evolução — {h.name}</p>
                <table className="w-full text-sm">
                  <thead><tr><th className="px-3 py-1.5 text-left text-xs font-medium text-muted-foreground">Resultado</th>{h.dates.map((d) => <th key={d} className="px-3 py-1.5 text-right text-xs font-medium text-muted-foreground">{date(d)}</th>)}</tr></thead>
                  <tbody>{h.rows.map((r) => <tr key={r.label} className="border-t"><td className="px-3 py-1.5">{r.label}</td>{r.values.map((v, i) => <td key={i} className="px-3 py-1.5 text-right tabular-nums">{v}</td>)}</tr>)}</tbody>
                </table>
              </div>
            ))}
          </div>
        )}
        {series.length >= 2 && (
          <div className="mt-6 grid gap-4 lg:grid-cols-2">
            <EvolutionChart title="Peso e dor" data={series} lines={[{ key: 'peso', label: 'Peso (kg)' }, { key: 'dor', label: 'Dor (0–10)' }]} />
            {numericKeys.length > 0 && <EvolutionChart title="Medidas e testes" data={series} lines={numericKeys.map((f: any) => ({ key: f.key, label: `${f.label}${f.unit ? ` (${f.unit})` : ''}` }))} />}
          </div>
        )}
      </Section>

      <Section title="Anamnese digital" actions={ctx.can('assessments.create') ? <NewAnamnesisButton patientId={patientId} templates={(templates.data ?? []) as any[]} /> : undefined}>
        {(anam.data ?? []).length === 0 ? <p className="text-sm text-muted-foreground">Nenhuma anamnese. Crie uma e envie o link para o aluno preencher antes da avaliação.</p> : (
          <ul className="divide-y">
            {((anam.data ?? []) as any[]).map((a) => (
              <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                <div>
                  <p className="font-medium">Criada em {dateTime(a.created_at, ctx.tz)}</p>
                  <p className="text-sm text-muted-foreground">
                    {a.status === 'completed' ? <>Preenchida em {dateTime(a.completed_at, ctx.tz)} por {a.filled_by === 'patient' ? 'aluno' : 'equipe'}{a.signature_name && ` · assinatura: ${a.signature_name}`}</> : <Badge variant="warning">Aguardando preenchimento</Badge>}
                  </p>
                </div>
                <AnamnesisActions anamnesis={{ id: a.id, status: a.status, link: a.public_token ? `${siteUrl}/anamnese/${a.public_token}` : null, questions: a.questions_snapshot, answers: a.answers }} patientId={patientId}
                  canEdit={ctx.can('assessments.edit')} canSend={ctx.can('communication.create')} />
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
}

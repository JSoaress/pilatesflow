import Link from 'next/link';
import { Plus, GitCompare } from 'lucide-react';
import { getAppContext } from '@/lib/auth/context';
import { Section, Table, Th, Td, Tr, EmptyState } from '@/components/ui/misc';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { date, dateTime, number } from '@/lib/format';
import { label, assessmentType } from '@/lib/labels';
import { AnamnesisActions, NewAnamnesisButton } from '@/components/app/clinical/anamnesis-actions';
import { NewFichaButton, FichaActions } from '@/components/app/clinical/ficha-actions';
import { EvolutionChart } from '@/components/app/clinical/evolution-chart';

export async function AssessmentsTab({ patientId }: { patientId: string }) {
  const ctx = await getAppContext();
  const [assess, anam, templates, fields, fichas, fichaTemplates] = await Promise.all([
    ctx.supabase.from('assessments').select('id, type, assessed_on, weight_kg, height_cm, bmi, pain_scale, status, data, staff(full_name), next_assessment_on').eq('patient_id', patientId).order('assessed_on', { ascending: false }),
    ctx.supabase.from('anamnesis').select('id, status, created_at, completed_at, filled_by, public_token, token_expires_at, signature_name, questions_snapshot, answers').eq('patient_id', patientId).order('created_at', { ascending: false }),
    ctx.supabase.from('anamnesis_templates').select('id, name').eq('organization_id', ctx.org.id).eq('is_active', true),
    ctx.supabase.from('assessment_fields').select('key, label, unit').eq('organization_id', ctx.org.id).eq('is_active', true).order('sort_order'),
    ctx.supabase.from('fichas').select('id, status, created_at, finalized_at, signature_name, questions_snapshot, answers, ficha_templates(name), staff(full_name)').eq('patient_id', patientId).order('created_at', { ascending: false }),
    ctx.supabase.from('ficha_templates').select('id, name').eq('organization_id', ctx.org.id).eq('is_active', true),
  ]);
  const list = (assess.data ?? []) as any[];
  const series = [...list].reverse().map((a) => ({ date: date(a.assessed_on), peso: a.weight_kg, imc: a.bmi, dor: a.pain_scale, ...(a.data ?? {}) }));
  const numericKeys = ((fields.data ?? []) as any[]).filter((f) => series.filter((s) => typeof (s as any)[f.key] === 'number').length >= 2).slice(0, 6);
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? '';

  return (
    <div className="space-y-6">
      <Section title="Avaliações físicas, funcionais e posturais"
        actions={<div className="flex gap-2">
          {list.length >= 2 && <Link href={`/app/avaliacoes/comparar?aluno=${patientId}`}><Button size="sm" variant="outline"><GitCompare /> Comparar</Button></Link>}
          {ctx.can('assessments.create') && <Link href={`/app/avaliacoes/nova?aluno=${patientId}`}><Button size="sm"><Plus /> Nova avaliação</Button></Link>}
        </div>}>
        {list.length === 0 ? <EmptyState title="Nenhuma avaliação" description="Registre a avaliação inicial para acompanhar a evolução." /> : (
          <Table>
            <thead><tr><Th>Data</Th><Th>Tipo</Th><Th>Peso</Th><Th>IMC</Th><Th>Dor</Th><Th>Profissional</Th><Th>Status</Th></tr></thead>
            <tbody>
              {list.map((a) => (
                <Tr key={a.id}>
                  <Td><Link href={`/app/avaliacoes/${a.id}`} className="font-medium text-primary hover:underline">{date(a.assessed_on)}</Link></Td>
                  <Td>{label(assessmentType, a.type)}</Td>
                  <Td className="tabular-nums">{a.weight_kg ? `${number(a.weight_kg, 1)} kg` : '—'}</Td>
                  <Td className="tabular-nums">{a.bmi ? number(a.bmi, 1) : '—'}</Td>
                  <Td className="tabular-nums">{a.pain_scale ?? '—'}</Td>
                  <Td>{a.staff?.full_name ?? '—'}</Td>
                  <Td><Badge variant={a.status === 'finalized' ? 'success' : 'warning'}>{a.status === 'finalized' ? 'Finalizada' : 'Rascunho'}</Badge></Td>
                </Tr>
              ))}
            </tbody>
          </Table>
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

      <Section title="Fichas de avaliação" actions={ctx.can('assessments.create') ? <NewFichaButton patientId={patientId} templates={(fichaTemplates.data ?? []) as any[]} /> : undefined}>
        {(fichas.data ?? []).length === 0 ? <p className="text-sm text-muted-foreground">Nenhuma ficha registrada.</p> : (
          <ul className="divide-y">
            {((fichas.data ?? []) as any[]).map((f) => (
              <li key={f.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                <div>
                  <p className="font-medium">{f.ficha_templates?.name ?? 'Ficha'} · {dateTime(f.created_at, ctx.tz)}</p>
                  <p className="text-sm text-muted-foreground">
                    {f.status === 'finalized' ? <>Finalizada em {dateTime(f.finalized_at, ctx.tz)}{f.staff?.full_name && ` · ${f.staff.full_name}`}{f.signature_name && ` · assinatura: ${f.signature_name}`}</> : <Badge variant="warning">Rascunho</Badge>}
                  </p>
                </div>
                <FichaActions ficha={{ id: f.id, status: f.status, questions: f.questions_snapshot, answers: f.answers }} patientId={patientId} canEdit={ctx.can('assessments.edit')} />
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
}

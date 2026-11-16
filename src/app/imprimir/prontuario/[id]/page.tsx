import { notFound } from 'next/navigation';
import { requirePermission } from '@/lib/auth/context';
import { loadPrintOrg, auditPrint } from '@/lib/print';
import { PrintBar } from '@/components/print/print-bar';
import { PrintSheet, PrintSection, PrintFields, SignatureLine } from '@/components/print/doc';
import { MR_GROUPS, EVOLUTION_FIELDS } from '@/lib/clinical-labels';
import { date, dateTime, ageFrom, number } from '@/lib/format';
import { label, gender, assessmentType } from '@/lib/labels';
import { PrintFormBody } from '@/components/print/print-form';
import { templateFromAssessment } from '@/lib/evaluation/server';

export const metadata = { title: 'Imprimir prontuário' };

const SECTIONS = [
  ['dados', 'Identificação'], ['anamnese', 'Anamneses'], ['prontuario', 'Prontuário'], ['evolucoes', 'Evoluções'], ['avaliacoes', 'Avaliações'],
] as const;

export default async function PrintRecord({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[]>> }) {
  const ctx = await requirePermission('medical_records.view');
  const { id } = await params;
  const sp = await searchParams;
  const chosen = new Set(sp.s ? (Array.isArray(sp.s) ? sp.s : [sp.s]) : SECTIONS.map(([k]) => k));
  const from = typeof sp.de === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(sp.de) ? sp.de : null;
  const to = typeof sp.ate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(sp.ate) ? sp.ate : null;
  const onlyFinal = sp.final === '1';

  const { data: p } = await ctx.supabase.from('patients').select('*').eq('id', id).eq('organization_id', ctx.org.id).maybeSingle();
  if (!p) notFound();

  let evoQ = ctx.supabase.from('clinical_evolutions').select('*, staff(full_name, professional_registry)').eq('patient_id', id).order('occurred_at');
  if (from) evoQ = evoQ.gte('occurred_at', from);
  if (to) evoQ = evoQ.lte('occurred_at', to + 'T23:59:59');
  if (onlyFinal) evoQ = evoQ.eq('status', 'finalized');
  const [org, mr, anam, evo, asmts, fields, contacts] = await Promise.all([
    loadPrintOrg(ctx, p.unit_id),
    chosen.has('prontuario') ? ctx.supabase.from('medical_records').select('*, staff:responsible_staff_id(full_name, professional_registry)').eq('patient_id', id).maybeSingle() : Promise.resolve({ data: null }),
    chosen.has('anamnese') ? ctx.supabase.from('anamnesis').select('id, completed_at, signature_name, questions_snapshot, answers, status').eq('patient_id', id).eq('status', 'completed').order('completed_at') : Promise.resolve({ data: [] }),
    chosen.has('evolucoes') ? evoQ : Promise.resolve({ data: [] }),
    chosen.has('avaliacoes') && ctx.can('assessments.view') ? ctx.supabase.from('assessments').select('*, staff(full_name, professional_registry)').eq('patient_id', id).order('assessed_on') : Promise.resolve({ data: [] }),
    ctx.supabase.from('assessment_fields').select('key, label, unit').eq('organization_id', ctx.org.id).order('sort_order'),
    ctx.supabase.from('emergency_contacts').select('name, relationship, phone').eq('patient_id', id),
  ]);
  await auditPrint(ctx, 'medical_records', id, { sections: [...chosen], from, to });

  const fieldMap = Object.fromEntries(((fields.data ?? []) as any[]).map((f) => [f.key, f]));
  const record = mr.data as any;
  const fmtAns = (v: unknown) => (v === true ? 'Sim' : v === false ? 'Não' : Array.isArray(v) ? v.join(', ') : v === null || v === undefined || v === '' ? '' : String(v));
  const signer = record?.staff ?? null;
  let first = true;
  const brk = () => { const b = !first; first = false; return b; };

  return (
    <>
      <PrintBar title={`Prontuário — ${p.full_name}`}>
        <form method="get" className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
          {SECTIONS.map(([k, l]) => (
            <label key={k} className="inline-flex items-center gap-1"><input type="checkbox" name="s" value={k} defaultChecked={chosen.has(k)} className="accent-[hsl(var(--primary))]" />{l}</label>
          ))}
          <label className="inline-flex items-center gap-1">Evoluções de <input type="date" name="de" defaultValue={from ?? ''} className="rounded border px-1" /></label>
          <label className="inline-flex items-center gap-1">até <input type="date" name="ate" defaultValue={to ?? ''} className="rounded border px-1" /></label>
          <label className="inline-flex items-center gap-1"><input type="checkbox" name="final" value="1" defaultChecked={onlyFinal} />Só finalizadas</label>
          <button className="rounded border px-2 py-1 hover:bg-muted">Aplicar</button>
        </form>
      </PrintBar>
      <PrintSheet org={org} confidential title="Prontuário do paciente" subtitle={<>{p.full_name}{p.birth_date ? ` · ${ageFrom(p.birth_date)} anos` : ''}{p.cpf ? ` · CPF ${p.cpf}` : ''}</>}>
        {chosen.has('dados') && (
          <PrintSection title="Identificação" breakBefore={brk()}>
            <PrintFields cols={3} items={[
              ['Nome', p.full_name], ['Nome social', p.social_name], ['Nascimento', p.birth_date ? date(p.birth_date) : null], ['Sexo', p.gender ? label(gender, p.gender) : null],
              ['CPF', p.cpf], ['Telefone', p.whatsapp || p.phone], ['E-mail', p.email], ['Profissão', p.profession],
              ['Endereço', [p.address_street, p.address_number, p.address_district, p.address_city && `${p.address_city}/${p.address_state ?? ''}`].filter(Boolean).join(', ') || null],
              ['Contato de emergência', ((contacts.data ?? []) as any[]).map((c) => `${c.name}${c.relationship ? ` (${c.relationship})` : ''} ${c.phone}`).join('; ') || null],
            ]} />
          </PrintSection>
        )}

        {chosen.has('anamnese') && (
          <PrintSection title="Anamneses respondidas">
            {((anam.data ?? []) as any[]).length === 0 ? <p className="text-[9.5pt] italic text-neutral-500">Nenhuma anamnese concluída.</p> :
              ((anam.data ?? []) as any[]).map((a) => (
                <div key={a.id} className="mb-4">
                  <p className="mb-1 text-[9.5pt] font-medium">Respondida em {dateTime(a.completed_at, ctx.tz)}{a.signature_name ? ` · assinada por ${a.signature_name}` : ''}</p>
                  <PrintFields cols={2} items={((a.questions_snapshot ?? []) as any[]).map((q) => [q.label, fmtAns(a.answers?.[q.id])] as [string, string])} />
                </div>
              ))}
          </PrintSection>
        )}

        {chosen.has('prontuario') && (
          <PrintSection title="Prontuário">
            {!record ? <p className="text-[9.5pt] italic text-neutral-500">Prontuário ainda não preenchido.</p> : MR_GROUPS.map((g) => (
              <div key={g.title} className="mb-3">
                <p className="mb-1 font-semibold">{g.title}</p>
                <PrintFields items={g.fields.map(([k, l]) => [l, record[k]] as [string, string])} />
              </div>
            ))}
            {record && <p className="text-[8.5pt] text-neutral-500">Última atualização: {dateTime(record.updated_at, ctx.tz)}</p>}
          </PrintSection>
        )}

        {chosen.has('evolucoes') && (
          <PrintSection title={`Evoluções${from || to ? ` (${from ? date(from) : 'início'} a ${to ? date(to) : 'hoje'})` : ''}`} breakBefore={((evo.data ?? []) as any[]).length > 3}>
            {((evo.data ?? []) as any[]).length === 0 ? <p className="text-[9.5pt] italic text-neutral-500">Nenhuma evolução no período.</p> :
              ((evo.data ?? []) as any[]).map((e) => (
                <div key={e.id} className="avoid-break mb-3 rounded border border-neutral-300 p-3">
                  <div className="mb-1 flex flex-wrap justify-between gap-2 text-[9.5pt]">
                    <span className="font-semibold">{dateTime(e.occurred_at, ctx.tz)}</span>
                    <span>{e.staff?.full_name ?? 'Profissional'}{e.staff?.professional_registry ? ` · ${e.staff.professional_registry}` : ''} · {e.status === 'finalized' ? `finalizada em ${dateTime(e.finalized_at, ctx.tz)}` : 'RASCUNHO'}</span>
                  </div>
                  {e.amends_id && <p className="mb-1 text-[9pt] italic">Adendo/retificação{e.amendment_reason ? `: ${e.amendment_reason}` : ''}</p>}
                  {(e.pain_before !== null || e.pain_after !== null) && <p className="text-[9.5pt]">Dor: antes {e.pain_before ?? '—'} / depois {e.pain_after ?? '—'} (0–10)</p>}
                  <PrintFields items={EVOLUTION_FIELDS.map(([k, l]) => [l, e[k]] as [string, string])} />
                  {Array.isArray(e.exercises) && e.exercises.length > 0 && (
                    <p className="mt-1 text-[9.5pt]"><span className="font-medium">Exercícios:</span> {e.exercises.map((x: any) => [x.name, x.springs && `molas ${x.springs}`, x.load, x.sets && x.reps && `${x.sets}×${x.reps}`].filter(Boolean).join(' ')).join('; ')}</p>
                  )}
                </div>
              ))}
          </PrintSection>
        )}

        {chosen.has('avaliacoes') && ((asmts.data ?? []) as any[]).length > 0 && (
          <PrintSection title="Avaliações">
            {((asmts.data ?? []) as any[]).map((a) => (
              a.form_key ? (
                <div key={a.id} className="mb-3 rounded border border-neutral-300 p-3">
                  <p className="mb-2 text-[9.5pt] font-semibold">{date(a.assessed_on)} · {a.form_name} · {a.staff?.full_name ?? ''}{a.status !== 'finalized' ? ' · RASCUNHO' : ''}</p>
                  <PrintFormBody template={templateFromAssessment(a)} answers={a.form_answers ?? {}} scores={a.form_scores ?? {}} />
                  {a.conclusion && <p className="mt-2 whitespace-pre-wrap text-[9.5pt]"><strong>Conclusão:</strong> {a.conclusion}</p>}
                </div>
              ) : (
              <div key={a.id} className="avoid-break mb-3 rounded border border-neutral-300 p-3">
                <p className="mb-1 text-[9.5pt] font-semibold">{date(a.assessed_on)} · {label(assessmentType, a.type)} · {a.staff?.full_name ?? ''}{a.status !== 'finalized' ? ' · RASCUNHO' : ''}</p>
                <PrintFields cols={3} items={[
                  ['Altura', a.height_cm ? `${number(a.height_cm, 1)} cm` : null], ['Peso', a.weight_kg ? `${number(a.weight_kg, 1)} kg` : null], ['IMC', a.bmi ? number(a.bmi, 1) : null],
                  ['Dor (0–10)', a.pain_scale], ['Borg', a.borg_scale],
                  ...Object.entries(a.data ?? {}).map(([k, v]) => [`${fieldMap[k]?.label ?? k}${fieldMap[k]?.unit ? ` (${fieldMap[k].unit})` : ''}`, String(v).replace('.', ',')] as [string, string]),
                ]} />
                <PrintFields items={[['Achados posturais', a.postural_findings], ['Conclusão', a.conclusion], ['Observações', a.notes]]} />
              </div>
              )
            ))}
          </PrintSection>
        )}

        {signer && <SignatureLine name={signer.full_name} detail={signer.professional_registry ? `Responsável técnico · ${signer.professional_registry}` : 'Responsável técnico'} />}
      </PrintSheet>
    </>
  );
}

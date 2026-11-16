import { notFound } from 'next/navigation';
import { requirePermission } from '@/lib/auth/context';
import { loadPrintOrg, auditPrint } from '@/lib/print';
import { PrintBar } from '@/components/print/print-bar';
import { PrintSheet, PrintFields, SignatureLine } from '@/components/print/doc';
import { PrintFormBody } from '@/components/print/print-form';
import { templateFromAssessment, ageAt } from '@/lib/evaluation/server';
import { date, dateTime } from '@/lib/format';
import { label, gender } from '@/lib/labels';

export const metadata = { title: 'Imprimir ficha de avaliação' };

export default async function PrintFilledForm({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string>> }) {
  const ctx = await requirePermission('assessments.view');
  const { id } = await params;
  const sp = await searchParams;
  const { data: a } = await ctx.supabase.from('assessments').select('*, patient:patients(id, full_name, social_name, birth_date, gender, cpf, phone, whatsapp, profession, unit_id), staff(full_name, professional_registry)').eq('id', id).eq('organization_id', ctx.org.id).maybeSingle();
  if (!a || !a.form_key) notFound();
  const p = (a as any).patient;
  const tpl = templateFromAssessment(a as any);
  const org = await loadPrintOrg(ctx, p.unit_id);
  await auditPrint(ctx, 'assessments', id, { form: a.form_key });
  const showEmpty = sp.vazios === '1';
  return (
    <>
      <PrintBar title={`${tpl.name} — ${p.social_name || p.full_name}`}>
        <form method="get" className="text-xs"><label className="inline-flex items-center gap-1">Itens sem resposta <select name="vazios" defaultValue={showEmpty ? '1' : '0'} className="rounded border px-1"><option value="0">Ocultar</option><option value="1">Mostrar</option></select></label> <button className="rounded border px-2 py-1 hover:bg-muted">Aplicar</button></form>
      </PrintBar>
      <PrintSheet org={org} confidential title={tpl.name}
        subtitle={<>{tpl.specialty} · Avaliação de {date(a.assessed_on)}{a.status === 'finalized' ? ` · finalizada em ${dateTime(a.finalized_at, ctx.tz)}` : ' · RASCUNHO (não finalizada)'}</>}>
        <div className="rounded border border-neutral-300 p-2.5">
          <PrintFields cols={3} items={[
            ['Paciente', p.full_name], ['Nascimento / idade', p.birth_date ? `${date(p.birth_date)} (${ageAt(p.birth_date, a.assessed_on)} anos)` : null], ['Sexo', p.gender ? label(gender, p.gender) : null],
            ['CPF', p.cpf], ['Telefone', p.whatsapp || p.phone], ['Profissão', p.profession],
          ]} />
        </div>
        <PrintFormBody template={tpl} answers={a.form_answers ?? {}} scores={a.form_scores ?? {}} showEmpty={showEmpty} />
        {(a.conclusion || a.next_assessment_on) && (
          <div className="avoid-break">
            <h2 className="mb-1 border-b border-[#2F6B5A] pb-0.5 text-[10.5pt] font-semibold uppercase tracking-wide text-[#2F6B5A]">Conclusão</h2>
            {a.conclusion && <p className="whitespace-pre-wrap text-[9.5pt]">{a.conclusion}</p>}
            {a.next_assessment_on && <p className="mt-1 text-[9.5pt]">Próxima avaliação: <strong>{date(a.next_assessment_on)}</strong></p>}
          </div>
        )}
        <SignatureLine name={(a as any).staff?.full_name ?? 'Profissional responsável'} detail={(a as any).staff?.professional_registry ?? 'Fisioterapeuta / Avaliador — registro profissional'} />
      </PrintSheet>
    </>
  );
}

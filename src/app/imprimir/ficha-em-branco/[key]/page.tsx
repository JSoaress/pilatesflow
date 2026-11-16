import { notFound } from 'next/navigation';
import { requirePermission } from '@/lib/auth/context';
import { loadPrintOrg } from '@/lib/print';
import { loadTemplate, ageAt } from '@/lib/evaluation/server';
import { PrintBar } from '@/components/print/print-bar';
import { PrintSheet, SignatureLine } from '@/components/print/doc';
import { PrintFormBody } from '@/components/print/print-form';
import { date, todayISO } from '@/lib/format';

export const metadata = { title: 'Ficha em branco' };

/** Ficha para imprimir e preencher à mão (identificação do aluno já preenchida, se informado). */
export default async function BlankForm({ params, searchParams }: { params: Promise<{ key: string }>; searchParams: Promise<Record<string, string>> }) {
  const ctx = await requirePermission('assessments.view');
  const key = decodeURIComponent((await params).key);
  const sp = await searchParams;
  const tpl = await loadTemplate(ctx, key);
  if (!tpl) notFound();
  const { data: p } = sp.aluno ? await ctx.supabase.from('patients').select('full_name, birth_date, cpf, phone, whatsapp, profession, unit_id').eq('id', sp.aluno).eq('organization_id', ctx.org.id).maybeSingle() : { data: null };
  const org = await loadPrintOrg(ctx, (p as any)?.unit_id);
  const P = p as any;
  const L = ({ w }: { w: string }) => <span className="inline-block border-b border-neutral-500 align-bottom" style={{ width: w, height: '5mm' }} />;
  return (
    <>
      <PrintBar title={`${tpl.name} — em branco`} />
      <PrintSheet org={org} title={tpl.name} subtitle={tpl.specialty} confidential>
        <div className="space-y-1.5 rounded border border-neutral-400 p-2.5 text-[9.5pt]">
          <p><strong>Paciente:</strong> {P ? P.full_name : <L w="120mm" />}</p>
          <p><strong>Nascimento:</strong> {P?.birth_date ? `${date(P.birth_date)} (${ageAt(P.birth_date, todayISO(ctx.tz))} anos)` : '____/____/______'} &nbsp; <strong>CPF:</strong> {P?.cpf ?? <L w="35mm" />} &nbsp; <strong>Telefone:</strong> {P ? (P.whatsapp || P.phone || <L w="35mm" />) : <L w="35mm" />}</p>
          <p><strong>Profissão:</strong> {P?.profession ?? <L w="55mm" />} &nbsp; <strong>Data da avaliação:</strong> ____/____/______ &nbsp; <strong>Avaliador:</strong> <L w="45mm" /></p>
        </div>
        <PrintFormBody template={tpl} blank />
        <div>
          <h2 className="mb-1 border-b border-[#2F6B5A] pb-0.5 text-[10.5pt] font-semibold uppercase tracking-wide text-[#2F6B5A]">Conclusão</h2>
          {Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-[6.5mm] border-b border-neutral-400" />)}
          <p className="mt-2 text-[9.5pt]"><strong>Próxima avaliação:</strong> ____/____/______</p>
        </div>
        <SignatureLine name="Assinatura e carimbo do profissional" detail="Fisioterapeuta / Avaliador — registro profissional" />
      </PrintSheet>
    </>
  );
}

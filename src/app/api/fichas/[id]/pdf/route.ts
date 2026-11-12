import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { SimplePdf, pdfResponse } from '@/lib/pdf/simple';
import { dateTime } from '@/lib/format';
import { env } from '@/lib/env';
import { storagePublicUrl } from '@/lib/utils';

const fmt = (v: unknown) => (v === true ? 'Sim' : v === false ? 'Não' : Array.isArray(v) ? v.join(', ') : v === undefined || v === null || v === '' ? '-' : String(v));

/** PDF da ficha de avaliação preenchida (equipe sempre; não há acesso via portal do aluno). */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.redirect(new URL('/login', env.siteUrl));
  const { data: f } = await supabase.from('fichas')
    .select('id, status, created_at, finalized_at, signature_name, questions_snapshot, answers, organization_id, patients(full_name, social_name), ficha_templates(name), staff(full_name)')
    .eq('id', id).maybeSingle() as { data: any };
  if (!f) return new NextResponse('Ficha não encontrada ou acesso negado.', { status: 404 });
  const { data: org } = await supabase.from('organizations').select('timezone, logo_path').eq('id', f.organization_id).single();
  const tz = org?.timezone ?? 'America/Sao_Paulo';
  const logoUrl = storagePublicUrl(env.supabaseUrl, 'site', org?.logo_path);
  await supabase.rpc('log_audit_event', { p_org: f.organization_id, p_action: 'download', p_entity: 'fichas', p_entity_id: id, p_context: { format: 'pdf' } });

  const patientName = f.patients?.social_name || f.patients?.full_name || '';
  const templateName = f.ficha_templates?.name ?? 'Ficha de avaliação';
  const pdf = await SimplePdf.create(templateName);
  await pdf.logo(logoUrl);
  pdf.text(templateName, { size: 14, bold: true, gap: 8 });
  pdf.kv('Aluno', patientName);
  pdf.kv('Data', dateTime(f.created_at, tz));
  pdf.kv('Profissional', f.staff?.full_name ?? '-');
  if (f.status !== 'finalized') pdf.text('RASCUNHO — ficha ainda não finalizada', { size: 9, bold: true, color: [0.72, 0.22, 0.12] });
  pdf.line(12);

  const questions = (f.questions_snapshot ?? []) as { id: string; section?: string | null; label: string }[];
  const answers = (f.answers ?? {}) as Record<string, unknown>;
  const sections = Array.from(new Set(questions.map((q) => q.section ?? '')));
  for (const s of sections) {
    if (s) pdf.text(s, { bold: true, size: 12, gap: 4 });
    for (const q of questions.filter((qq) => (qq.section ?? '') === s)) {
      pdf.qa(q.label, fmt(answers[q.id]), 10);
    }
    pdf.line(6);
  }
  if (f.signature_name) { pdf.line(6); pdf.text(`Assinatura do profissional: ${f.signature_name}`, { size: 10 }); }
  pdf.footer(templateName);
  return pdfResponse(await pdf.bytes(), `${templateName}-${patientName || id.slice(0, 8)}.pdf`);
}

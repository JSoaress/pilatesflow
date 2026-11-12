import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { SimplePdf, pdfResponse } from '@/lib/pdf/simple';
import { env } from '@/lib/env';
import { storagePublicUrl } from '@/lib/utils';

type Q = { section: string | null; label: string; help_text: string | null; type: string; options: string[] | null; scale_min: number | null; scale_max: number | null; required: boolean };

function label(pdf: SimplePdf, q: Q) {
  pdf.text(`${q.label}${q.required ? ' *' : ''}`, { bold: true, size: 10, gap: q.help_text ? 1 : 2 });
  if (q.help_text) pdf.text(q.help_text, { size: 8, color: [0.45, 0.47, 0.46], gap: 3 });
}

/** Versão em branco do modelo de ficha, para impressão e preenchimento à mão (papel, sem aluno vinculado). */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.redirect(new URL('/login', env.siteUrl));
  const { data: tpl } = await supabase.from('ficha_templates').select('id, name, description, organization_id').eq('id', id).maybeSingle();
  if (!tpl) return new NextResponse('Modelo não encontrado ou acesso negado.', { status: 404 });
  const [{ data: questions }, { data: org }] = await Promise.all([
    supabase.from('ficha_questions').select('section, label, help_text, type, options, scale_min, scale_max, required').eq('template_id', id).eq('is_active', true).order('sort_order'),
    supabase.from('organizations').select('logo_path').eq('id', tpl.organization_id).single(),
  ]);
  const logoUrl = storagePublicUrl(env.supabaseUrl, 'site', org?.logo_path);

  const pdf = await SimplePdf.create(tpl.name);
  await pdf.logo(logoUrl);
  pdf.text(tpl.name, { size: 14, bold: true, gap: 4 });
  if (tpl.description) pdf.text(tpl.description, { size: 9, color: [0.45, 0.47, 0.46], gap: 6 });
  label(pdf, { section: null, label: 'Aluno', help_text: null, type: 'text', options: null, scale_min: null, scale_max: null, required: false });
  pdf.answerRule();
  label(pdf, { section: null, label: 'Data', help_text: null, type: 'text', options: null, scale_min: null, scale_max: null, required: false });
  pdf.answerRule();
  label(pdf, { section: null, label: 'Profissional', help_text: null, type: 'text', options: null, scale_min: null, scale_max: null, required: false });
  pdf.answerRule();
  pdf.line(12);

  const qs = (questions ?? []) as Q[];
  const sections = Array.from(new Set(qs.map((q) => q.section ?? '')));
  for (const s of sections) {
    if (s) pdf.text(s, { bold: true, size: 12, gap: 4 });
    for (const q of qs.filter((qq) => (qq.section ?? '') === s)) {
      label(pdf, q);
      switch (q.type) {
        case 'textarea': pdf.ruledLines(3); break;
        case 'yes_no': pdf.checklist(['Sim', 'Não']); break;
        case 'select': case 'multi_select': pdf.checklist(q.options ?? []); break;
        case 'scale': {
          const min = q.scale_min ?? 0, max = q.scale_max ?? 10;
          pdf.checklist(Array.from({ length: max - min + 1 }, (_, i) => String(min + i)));
          break;
        }
        default: pdf.answerRule(); // text, number, date, signature
      }
      pdf.y -= 6;
    }
    pdf.line(6);
  }
  label(pdf, { section: null, label: 'Assinatura do profissional', help_text: null, type: 'text', options: null, scale_min: null, scale_max: null, required: false });
  pdf.answerRule();
  pdf.footer(tpl.name);
  return pdfResponse(await pdf.bytes(), `${tpl.name}-em-branco.pdf`);
}

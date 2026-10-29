import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { SimplePdf, pdfResponse } from '@/lib/pdf/simple';
import { dateTime } from '@/lib/format';
import { env } from '@/lib/env';
import { storagePublicUrl } from '@/lib/utils';

/** PDF do contrato (versão imutável), com registro de aceite e hash do conteúdo. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.redirect(new URL('/login', env.siteUrl));
  let c: any = (await supabase.from('contracts').select('id, number, title, content, content_hash, status, accepted_at, accepted_by_name, accepted_ip, created_at, organization_id').eq('id', id).maybeSingle()).data;
  let tz = 'America/Sao_Paulo';
  let logoUrl: string | null = null;
  if (!c) {
    // portal do aluno
    const { data: me } = await supabase.rpc('portal_me');
    for (const p of (me ?? []) as any[]) {
      const { data: docs } = await supabase.rpc('portal_documents', { p_patient_id: p.patient_id });
      const found = ((docs as any)?.contracts ?? []).find((x: any) => x.id === id);
      if (found) { c = { ...found, number: '' }; break; }
    }
  } else {
    const { data: o } = await supabase.from('organizations').select('timezone, logo_path').eq('id', c.organization_id).single();
    tz = o?.timezone ?? tz;
    logoUrl = storagePublicUrl(env.supabaseUrl, 'site', o?.logo_path);
    await supabase.rpc('log_audit_event', { p_org: c.organization_id, p_action: 'download', p_entity: 'contracts', p_entity_id: id, p_context: { format: 'pdf' } });
  }
  if (!c) return new NextResponse('Contrato não encontrado ou acesso negado.', { status: 404 });
  const pdf = await SimplePdf.create(c.title);
  await pdf.logo(logoUrl);
  pdf.text(c.title, { size: 14, bold: true, gap: 8 });
  pdf.paragraph(c.content);
  pdf.line(12);
  if (c.accepted_at) {
    pdf.text('Registro de aceite eletrônico', { bold: true, size: 10 });
    pdf.text(`Aceito por ${c.accepted_by_name} em ${dateTime(c.accepted_at, tz)}${c.accepted_ip ? ` · IP ${c.accepted_ip}` : ''}`, { size: 9 });
  } else pdf.text(`Status: ${c.status === 'draft' ? 'rascunho' : c.status === 'sent' ? 'aguardando aceite' : c.status}`, { size: 9 });
  if (c.content_hash) pdf.text(`Integridade (SHA-256): ${c.content_hash}`, { size: 7, color: [0.45, 0.47, 0.46] });
  pdf.footer(`Contrato${c.number ? ` nº ${c.number}` : ''}`);
  return pdfResponse(await pdf.bytes(), `contrato-${c.number || id.slice(0, 8)}.pdf`);
}

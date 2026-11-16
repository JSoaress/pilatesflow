import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { SimplePdf, pdfResponse } from '@/lib/pdf/simple';
import { dateTime } from '@/lib/format';
import { env } from '@/lib/env';
import { storagePublicUrl } from '@/lib/utils';

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.redirect(new URL('/login', req.url));
  let d: any = (await supabase.from('documents').select('id, title, content, content_hash, status, signed_at, signed_name, signed_ip, organization_id').eq('id', id).maybeSingle()).data;
  let logoUrl: string | null = null;
  if (!d) {
    const { data: me } = await supabase.rpc('portal_me');
    for (const p of (me ?? []) as any[]) {
      const { data: docs } = await supabase.rpc('portal_documents', { p_patient_id: p.patient_id });
      const found = ((docs as any)?.documents ?? []).find((x: any) => x.id === id);
      if (found) { d = found; break; }
    }
  } else {
    const { data: org } = await supabase.from('organizations').select('logo_path').eq('id', d.organization_id).single();
    logoUrl = storagePublicUrl(env.supabaseUrl, 'site', org?.logo_path);
    await supabase.rpc('log_audit_event', { p_org: d.organization_id, p_action: 'download', p_entity: 'documents', p_entity_id: id, p_context: { format: 'pdf' } });
  }
  if (!d) return new NextResponse('Documento não encontrado ou acesso negado.', { status: 404 });
  const pdf = await SimplePdf.create(d.title);
  await pdf.logo(logoUrl);
  pdf.text(d.title, { size: 14, bold: true, gap: 8 });
  pdf.paragraph(d.content ?? '');
  if (d.signed_at) { pdf.line(12); pdf.text(`Assinado eletronicamente por ${d.signed_name} em ${dateTime(d.signed_at)}${d.signed_ip ? ` · IP ${d.signed_ip}` : ''}`, { size: 9 }); }
  if (d.content_hash) pdf.text(`Integridade (SHA-256): ${d.content_hash}`, { size: 7, color: [0.45, 0.47, 0.46] });
  pdf.footer(d.title);
  return pdfResponse(await pdf.bytes(), `${d.title}.pdf`);
}

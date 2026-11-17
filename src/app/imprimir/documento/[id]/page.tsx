import { notFound, redirect } from 'next/navigation';
import type { PrintOrg } from '@/lib/print';
import { createClient } from '@/lib/supabase/server';
import { PrintBar } from '@/components/print/print-bar';
import { PrintSheet } from '@/components/print/doc';
import { dateTime } from '@/lib/format';
import { env } from '@/lib/env';
import { storagePublicUrl } from '@/lib/utils';

export const metadata = { title: 'Documento', robots: { index: false, follow: false } };

const baseOrg = (name = '', logo: string | null = null): PrintOrg => ({ name, legal_name: null, cnpj: null, phone: null, email: null, logo, address: null });

/** Documento para impressão (equipe ou o próprio aluno via portal). */
export default async function PrintDocument({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect('/login');
  let d: any = (await supabase.from('documents').select('id, title, content, content_hash, status, signed_at, signed_name, signed_ip, organization_id').eq('id', id).maybeSingle()).data;
  let org: PrintOrg = baseOrg();
  if (!d) {
    // portal do aluno
    const { data: me } = await supabase.rpc('portal_me');
    for (const p of (me ?? []) as any[]) {
      const { data: docs } = await supabase.rpc('portal_documents', { p_patient_id: p.patient_id });
      const found = ((docs as any)?.documents ?? []).find((x: any) => x.id === id);
      if (found) { d = found; org = baseOrg(p.organization_name, storagePublicUrl(env.supabaseUrl, 'site', p.logo_path)); break; }
    }
  } else {
    const { data: o } = await supabase.from('organizations').select('name, legal_name, cnpj, phone, email, logo_path').eq('id', d.organization_id).single();
    if (o) org = { name: o.name, legal_name: o.legal_name, cnpj: o.cnpj, phone: o.phone, email: o.email, logo: storagePublicUrl(env.supabaseUrl, 'site', o.logo_path), address: null };
    await supabase.rpc('log_audit_event', { p_org: d.organization_id, p_action: 'print', p_entity: 'documents', p_entity_id: id, p_context: { format: 'html' } });
  }
  if (!d) notFound();
  return (
    <>
      <PrintBar title={d.title} />
      <PrintSheet org={org} title={d.title} footerNote={d.content_hash ? `Integridade (SHA-256): ${d.content_hash}` : undefined}>
        <div className="whitespace-pre-wrap leading-relaxed">{d.content ?? ''}</div>
        {d.signed_at && <p className="text-[9pt] text-neutral-600">Assinado eletronicamente por {d.signed_name} em {dateTime(d.signed_at)}{d.signed_ip ? ` · IP ${d.signed_ip}` : ''}</p>}
      </PrintSheet>
    </>
  );
}
